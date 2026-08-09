"""Headless LinkedIn job scan — standalone script, run as a subprocess.

Mirrors the pattern already used by Spiritus's headless
browser_scrape branch and export_pdf: Playwright runs in its own
process (not inside the pywebview app) to avoid thread/greenlet conflicts,
and reuses the same persistent Chromium profile dir so an existing LinkedIn
login carries over with no separate auth flow.

Usage:
    python linkedin_scan.py <profile_dir> <settings_json>

<settings_json> shape:
    {"include_recommended": true, "searches": [
        {"keywords": "", "location": "", "workplace_types": ["remote"],
         "employment_types": ["full-time"], "date_posted": "week"}
    ]}

Prints exactly one JSON line to stdout:
    {"ok": true, "jobs": [...]}
    {"ok": false, "error": "linkedin_login_required" | "<message>"}

This is deliberately app-owned (not Spiritus) — LinkedIn-specific selectors
and URL construction don't belong in a domain-ignorant Core.
"""
from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import sys

RECOMMENDED_URL = "https://www.linkedin.com/jobs/collections/recommended/"
SEARCH_URL = "https://www.linkedin.com/jobs/search/"


def _system_chrome_available() -> bool:
    """Return whether the machine has a Chrome installation Playwright can use."""
    names = ("google-chrome", "google-chrome-stable", "chrome")
    if sys.platform == "win32":
        local = os.environ.get("LOCALAPPDATA", "")
        program_files = os.environ.get("PROGRAMFILES", "")
        program_files_x86 = os.environ.get("PROGRAMFILES(X86)", "")
        candidates = (
            os.path.join(local, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(program_files, "Google", "Chrome", "Application", "chrome.exe"),
            os.path.join(program_files_x86, "Google", "Chrome", "Application", "chrome.exe"),
        )
        return any(os.path.isfile(path) for path in candidates) or bool(shutil.which("chrome.exe"))
    if sys.platform == "darwin":
        candidates = (
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            os.path.expanduser("~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
        )
        return any(os.path.isfile(path) for path in candidates)
    return any(shutil.which(name) for name in names)

# LinkedIn's own enumerated facet values (its search page's f_WT/f_JT query
# params) — reused as-is rather than inventing our own free-text equivalents,
# since a value like "remote" typed into a location box doesn't mean anything
# to LinkedIn's search backend.
WORKPLACE_TYPE_CODES = {"onsite": "1", "remote": "2", "hybrid": "3"}
EMPLOYMENT_TYPE_CODES = {
    "full-time": "F", "part-time": "P", "contract": "C",
    "temporary": "T", "internship": "I", "volunteer": "V", "other": "O",
}
# LinkedIn's "Date posted" facet (f_TPR) - a fixed enum, not a free-range
# picker, so it's reused the same way as f_WT/f_JT. Only applies to configured
# searches; the recommended-for-you collection is algorithmic and doesn't take
# query params.
DATE_POSTED_CODES = {"day": "r86400", "week": "r604800", "month": "r2592000"}

_AGE_UNIT_HOURS = {
    "second": 1 / 3600, "minute": 1 / 60, "hour": 1,
    "day": 24, "week": 24 * 7, "month": 24 * 30, "year": 24 * 365,
}


def posted_text_to_hours(text: str) -> float | None:
    """Parse LinkedIn's relative posted-time text ("3 weeks ago") into an
    approximate age in hours, for staleness sorting. Returns None if
    unparseable (kept last in a recency sort, rather than assumed fresh)."""
    if not text:
        return None
    m = re.search(r"(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago", text, re.IGNORECASE)
    if not m:
        return None
    return int(m.group(1)) * _AGE_UNIT_HOURS[m.group(2).lower()]

# How many cards per page get the (slower) detail-pane click-through for
# applicant count / promoted / reposted signals. Keeps scan time and click
# volume against LinkedIn bounded; the rest still get list-card fields.
DETAIL_CLICK_LIMIT = 20

# Extracts visible job cards from either the recommended collection or a
# search-results page — both share the same list-item markup on LinkedIn today.
# NOTE: LinkedIn changes its DOM periodically; these selectors may need
# updating over time. Multiple fallbacks are used to reduce breakage.
EXTRACT_JS = r"""
() => {
  const cards = document.querySelectorAll(
    '[data-occludable-job-id], li.jobs-search-results__list-item, div.job-card-container'
  );
  const out = [];
  const seen = new Set();
  cards.forEach((card) => {
    const jobId = card.getAttribute('data-occludable-job-id')
      || card.getAttribute('data-job-id')
      || (card.querySelector('[data-job-id]') || {}).getAttribute
        && card.querySelector('[data-job-id]').getAttribute('data-job-id');
    if (!jobId || seen.has(jobId)) return;

    const linkEl = card.querySelector('a.job-card-container__link, a.job-card-list__title, a[href*="/jobs/view/"]');
    const titleEl = card.querySelector('.job-card-container__link, .job-card-list__title, strong');
    const companyEl = card.querySelector('.job-card-container__company-name, .job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
    const locationEl = card.querySelector('.job-card-container__metadata-item, .artdeco-entity-lockup__caption');
    const timeEl = card.querySelector('time');
    const easyApplyEl = card.querySelector('.job-card-container__easy-apply-icon, [aria-label*="Easy Apply" i]');

    const title = (titleEl ? titleEl.textContent : (linkEl ? linkEl.textContent : '')).trim();
    if (!title) return;

    // Footer/insight items (below the title/company block) carry badges like
    // "Promoted", "Reposted", "Actively recruiting", "Viewed", "Applied".
    const footerText = Array.from(
      card.querySelectorAll('.job-card-container__footer-item, .job-card-list__footer-wrapper li')
    ).map(el => el.textContent.trim()).join(' | ');

    seen.add(jobId);
    out.push({
      job_id: jobId,
      title,
      company: companyEl ? companyEl.textContent.trim() : '',
      location: locationEl ? locationEl.textContent.trim() : '',
      link: linkEl ? new URL(linkEl.getAttribute('href'), location.href).toString().split('?')[0] : '',
      posted_text: timeEl ? timeEl.textContent.trim() : '',
      easy_apply: !!easyApplyEl,
      card_footer_text: footerText,
    });
  });
  return out;
}
"""

# The detail pane (opened by clicking a card) carries fields the compact list
# card doesn't: applicant/apply-click counts, promoted/reposted disclosures.
# Grabbed as plain innerText and regex-parsed in Python (easier to iterate on
# than JS regex, and the pane's exact class names shift more than the list
# card's do).
DETAIL_PANE_JS = r"""
() => {
  const el = document.querySelector(
    '.jobs-details, .jobs-search__job-details, [class*="jobs-unified-top-card"], [class*="job-details"]'
  );
  return el ? el.innerText : '';
}
"""

_APPLICANT_RE = re.compile(
    r"(Over \d[\d,]*\+?|Be among the first \d+|\d[\d,]*)\s*(applicants|people clicked apply)",
    re.IGNORECASE,
)
# List cards for promoted/sponsored listings replace the "posted X ago" <time>
# element with a "Promoted" label (there's no time element at all - not a
# scrape failure). The real posted date still appears in the detail pane, so
# it's used as a fallback when the list card had none.
_POSTED_RE = re.compile(
    r"(Reposted\s+)?\b(\d+\s*(?:second|minute|hour|day|week|month|year)s?\s+ago)",
    re.IGNORECASE,
)


def _clean_posted_text(raw: str) -> str:
    """The list card's <time> element's textContent sometimes concatenates a
    hidden screen-reader-only string after the visible one (e.g. "6 hours
    ago" + "Within the past 24 hours"). Keep only the clean "N ago" phrase."""
    m = _POSTED_RE.search(raw or "")
    return m.group(2).strip() if m else (raw or "").strip()


def _parse_detail_text(text: str) -> dict:
    text = text or ""
    out: dict = {}
    m = _APPLICANT_RE.search(text)
    if m:
        out["applicant_text"] = m.group(0).strip()
    low = text.lower()
    out["linkedin_promoted"] = "promoted" in low
    out["actively_recruiting"] = "actively recruiting" in low
    m = _POSTED_RE.search(text)
    if m:
        out["detail_posted_text"] = m.group(2).strip()
        out["detail_reposted"] = bool(m.group(1))
    return out


def _is_login_wall(url: str) -> bool:
    return "/login" in url or "/authwall" in url or "checkpoint/challenge" in url


def _scan_page(page, url: str, source: str, source_label: str) -> list[dict]:
    page.goto(url, wait_until="domcontentloaded", timeout=30000)
    page.wait_for_timeout(1500)
    if _is_login_wall(page.url):
        raise RuntimeError("linkedin_login_required")

    # LinkedIn's job list lazy-loads on scroll — nudge it a few times so more
    # than the first screenful of cards is available to extract.
    for _ in range(4):
        page.mouse.wheel(0, 1800)
        page.wait_for_timeout(700)

    cards = page.evaluate(EXTRACT_JS)
    for card in cards:
        card["source"] = source
        card["source_label"] = source_label
        footer = card.pop("card_footer_text", "") or ""
        card["reposted"] = "reposted" in (card.get("posted_text", "") + footer).lower()
        card["posted_text"] = _clean_posted_text(card.get("posted_text", ""))

    # Click through a bounded number of cards so LinkedIn's in-page detail
    # pane loads (no navigation — same SPA page) and pull applicant-count /
    # promoted signals that only appear there, not on the compact card.
    for card in cards[:DETAIL_CLICK_LIMIT]:
        try:
            locator = page.locator(f'[data-occludable-job-id="{card["job_id"]}"]').first
            locator.click(timeout=5000)
            page.wait_for_timeout(900)
            detail_text = page.evaluate(DETAIL_PANE_JS)
            parsed = _parse_detail_text(detail_text)
            if not card.get("posted_text") and parsed.get("detail_posted_text"):
                card["posted_text"] = parsed["detail_posted_text"]
                card["reposted"] = parsed.get("detail_reposted", False)
            parsed.pop("detail_posted_text", None)
            parsed.pop("detail_reposted", None)
            card.update(parsed)
        except Exception:
            pass  # leave list-card fields as-is; one bad click shouldn't break the scan

    for card in cards:
        card["posted_hours_ago"] = posted_text_to_hours(card.get("posted_text", ""))

    return cards


def run(profile_dir: str, settings: dict) -> dict:
    from playwright.sync_api import sync_playwright

    lock = pathlib.Path(profile_dir) / "SingletonLock"
    try:
        if lock.exists() or lock.is_symlink():
            lock.unlink()
    except Exception:
        pass
    pathlib.Path(profile_dir).mkdir(parents=True, exist_ok=True)

    jobs: list[dict] = []
    browser_channel = "chrome" if _system_chrome_available() else None
    with sync_playwright() as pw:
        ctx = pw.chromium.launch_persistent_context(
            profile_dir,
            headless=True,
            channel=browser_channel,
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            page = ctx.pages[0] if ctx.pages else ctx.new_page()

            if settings.get("include_recommended", True):
                jobs.extend(_scan_page(page, RECOMMENDED_URL, "recommended", "Recommended for you"))

            for search in settings.get("searches", []):
                keywords = (search.get("keywords") or "").strip()
                loc = (search.get("location") or "").strip()
                workplace_types = [w for w in (search.get("workplace_types") or []) if w in WORKPLACE_TYPE_CODES]
                employment_types = [e for e in (search.get("employment_types") or []) if e in EMPLOYMENT_TYPE_CODES]
                date_posted = search.get("date_posted") or ""
                if date_posted not in DATE_POSTED_CODES:
                    date_posted = ""
                if not keywords and not loc and not workplace_types and not employment_types and not date_posted:
                    continue
                params = []
                if keywords:
                    params.append(f"keywords={_url_quote(keywords)}")
                if loc:
                    params.append(f"location={_url_quote(loc)}")
                if workplace_types:
                    params.append("f_WT=" + ",".join(WORKPLACE_TYPE_CODES[w] for w in workplace_types))
                if employment_types:
                    params.append("f_JT=" + ",".join(EMPLOYMENT_TYPE_CODES[e] for e in employment_types))
                if date_posted:
                    params.append(f"f_TPR={DATE_POSTED_CODES[date_posted]}")
                url = f"{SEARCH_URL}?{'&'.join(params)}"
                label = keywords or loc or " + ".join(workplace_types + employment_types)
                jobs.extend(_scan_page(page, url, "search", label))
        finally:
            ctx.close()

    return {"ok": True, "jobs": jobs}


def _url_quote(s: str) -> str:
    from urllib.parse import quote

    return quote(s)


def main() -> None:
    if len(sys.argv) < 3:
        print(json.dumps({"ok": False, "error": "usage: linkedin_scan.py <profile_dir> <settings_json>"}))
        return
    profile_dir = sys.argv[1]
    try:
        settings = json.loads(sys.argv[2])
    except Exception as e:
        print(json.dumps({"ok": False, "error": f"invalid settings JSON: {e}"}))
        return

    try:
        result = run(profile_dir, settings)
    except RuntimeError as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        return

    print(json.dumps(result))


if __name__ == "__main__":
    main()
