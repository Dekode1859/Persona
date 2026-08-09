# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What Persona is

A desktop app for building a structured profile of your work, tracking jobs
against it, and tailoring applications. It is a **Spiritus application**: this
repo holds configuration and domain assets only. The runtime — window, agent
execution, storage, providers, JS↔Python bridge — comes from the `spiritus`
package.

## Running

```bash
uv sync
uv run python run.py  # bootstraps Playwright on first run
```

Requires Python 3.11+. The OpenCode engine is fetched automatically —
`run.py` calls `spiritus.engine.ensure()`, which downloads the pinned build
(~60 MB) into a per-user cache the first time only. `spiritus` never downloads
implicitly on its own; this app opts in from its bootstrap. To use an engine you
already have, set `SPIRITUS_OPENCODE_BIN` or put `opencode` on PATH — both take
precedence over the cache.

## The Core boundary

`main.py` is the entire contract: one `AppConfig`, one `run()` call. Core reads
that object and nothing else app-specific.

Core is a dependency, not vendored source. Persona pins the released Spiritus
tag `v0.0.31` through a direct Git dependency, so local development and CI use
the same install contract. Edits to a sibling `../spiritus` checkout do not
silently change Persona.

**Never add domain knowledge to Core.** No jobs, resumes, profiles, or LinkedIn
anything in `spiritus`. The test: would this make sense in a cooking-recipe app?
If not, it belongs here. To extend the JS↔Python surface, subclass `Bridge` in
`app_bridge.py` and pass it via `AppConfig.bridge_cls` — that's what
`PersonaBridge` exists for.

The earlier application prototype is not part of this repository's runtime.

## Scanner roadmap

The Scanner tab (`scanner/`, `app_bridge.py`) headlessly pulls jobs from the
user's logged-in LinkedIn session via the shared `workspace/browser-profile`
Chromium profile. LinkedIn selectors and URL construction live in
`scanner/linkedin_scan.py`, never in `spiritus`. Scanned jobs land in
`workspace/jobs/scanner-feed.json`, separate from tracked jobs in `jobs.json`,
until explicitly promoted.

Shipped (manual only): a "Scan now" button that scrapes the recommended-for-you
feed plus any configured keyword/location searches, deduped on card-level fields
(title, company, location, link, posted time, easy-apply).

Deliberately deferred — **do not build without discussing the approach first**:

- **Recurrence while the app is closed.** Scanning currently happens only on
  demand while the app is open. The eventual goal is background operation (e.g.
  a system-tray mode) enabling near-real-time notifications — no mechanism
  chosen yet.
- **Windows notifications** for new matching jobs, once recurrence exists.
- **Full per-job detail extraction** — deterministic parsing vs. plugging in the
  existing `job-extract` agent. Undecided until the scan pipeline is proven out.
- **Scanner-side insights** — e.g. flagging job descriptions with incoherent
  requirements (implausible years-of-experience for tools that haven't existed
  that long) as a signal of a disorganized originating company.

## Git commit rules (MUST FOLLOW)

**Authorship:** every commit uses only the global git identity —
`Dekode1859 <prateekdwivedi30@gmail.com>`. Never append `Co-Authored-By`,
`Co-authored-by`, or any other authorship trailer. No exceptions.

**When to commit:** do not commit autonomously during active feature work. Once
the user has tested a change and confirmed it behaves as expected, ask *"Would
you like to commit the current state?"* and commit only after they say yes.

```bash
git -c user.name="Dekode1859" -c user.email="prateekdwivedi30@gmail.com" commit -m "message"
```

## Tech stack

Python 3.11+, PyWebView, OpenCode CLI, Playwright (browser automation),
vanilla JS + Shoelace 2.19.1 + Lucide on the front end (no build step), `uv` for
dependencies, Spiritus's manifest-driven bundle builder, Inno Setup, and DMG
creation.
