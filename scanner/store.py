"""Owns workspace/jobs/scanner-feed.json and scanner-settings.json.

Python-owned (unlike jobs.json, which the JS UI reads/writes directly) so
merge/dedupe logic has a single writer and no concurrent-write hazard.
"""
from __future__ import annotations

import json
import time
from pathlib import Path

from .linkedin_scan import DATE_POSTED_CODES, EMPLOYMENT_TYPE_CODES, WORKPLACE_TYPE_CODES

FEED_FILE = "jobs/scanner-feed.json"
SETTINGS_FILE = "jobs/scanner-settings.json"

DEFAULT_SETTINGS = {"include_recommended": True, "searches": []}


def _read_json(path: Path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_settings(workspace: Path) -> dict:
    settings = _read_json(workspace / SETTINGS_FILE, None)
    if not isinstance(settings, dict):
        return dict(DEFAULT_SETTINGS)
    return {**DEFAULT_SETTINGS, **settings}


def _clean_search(s: dict) -> dict:
    date_posted = s.get("date_posted") or ""
    return {
        "keywords": str(s.get("keywords") or ""),
        "location": str(s.get("location") or ""),
        "workplace_types": [w for w in (s.get("workplace_types") or []) if w in WORKPLACE_TYPE_CODES],
        "employment_types": [e for e in (s.get("employment_types") or []) if e in EMPLOYMENT_TYPE_CODES],
        "date_posted": date_posted if date_posted in DATE_POSTED_CODES else "",
    }


def save_settings(workspace: Path, settings: dict) -> dict:
    searches = [_clean_search(s) for s in (settings.get("searches") or [])]
    clean = {
        "include_recommended": bool(settings.get("include_recommended", True)),
        "searches": [
            s for s in searches
            if s["keywords"] or s["location"] or s["workplace_types"]
            or s["employment_types"] or s["date_posted"]
        ],
    }
    _write_json(workspace / SETTINGS_FILE, clean)
    return clean


def get_feed(workspace: Path) -> list:
    feed = _read_json(workspace / FEED_FILE, [])
    return feed if isinstance(feed, list) else []


def merge_feed(workspace: Path, found: list[dict]) -> list:
    """Dedupe incoming cards by job_id (falling back to link) against the
    existing feed, preserving first_seen_at/promoted/dismissed and bumping
    last_seen_at on every card seen again.

    Sort order is recency of the actual LinkedIn posting (freshest first,
    unparseable/unknown dates last) - not scan time - so stale month-old
    listings sink to the bottom instead of just being wherever they landed.
    """
    existing = get_feed(workspace)
    by_key = {(j.get("job_id") or j.get("link")): j for j in existing}
    now = int(time.time() * 1000)

    for card in found:
        key = card.get("job_id") or card.get("link")
        if not key:
            continue
        # Re-anchor the relative "N ago" text to an absolute timestamp on every
        # scan, using *this* scan's clock - keeps sort order accurate across
        # rescans instead of the relative text going stale between scans.
        hours_ago = card.get("posted_hours_ago")
        if hours_ago is not None:
            card["posted_at_ms"] = now - int(hours_ago * 3600 * 1000)
        prior = by_key.get(key)
        if prior:
            prior.update({k: v for k, v in card.items() if k not in ("first_seen_at",)})
            prior["last_seen_at"] = now
        else:
            card["first_seen_at"] = now
            card["last_seen_at"] = now
            card.setdefault("promoted", False)
            card.setdefault("dismissed", False)
            by_key[key] = card

    merged = sorted(
        by_key.values(),
        key=lambda j: j.get("posted_at_ms") if j.get("posted_at_ms") is not None else -1,
        reverse=True,
    )
    _write_json(workspace / FEED_FILE, merged)
    return merged


def mark_promoted(workspace: Path, job_id: str) -> list:
    feed = get_feed(workspace)
    for j in feed:
        if (j.get("job_id") or j.get("link")) == job_id:
            j["promoted"] = True
    _write_json(workspace / FEED_FILE, feed)
    return feed


def dismiss(workspace: Path, job_id: str) -> list:
    feed = get_feed(workspace)
    for j in feed:
        if (j.get("job_id") or j.get("link")) == job_id:
            j["dismissed"] = True
    _write_json(workspace / FEED_FILE, feed)
    return feed
