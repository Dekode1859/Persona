# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

## What Persona is

A desktop app for building a structured profile of your work, tracking jobs
against it, and tailoring applications. It is an **AgentOS application**: this
repo holds configuration and domain assets only. The runtime — window, agent
execution, storage, providers, JS↔Python bridge — comes from the `agentos`
package.

## Running

```bash
make install    # uv sync
make run        # uv run python run.py  (bootstraps Playwright on first run)
```

Requires Python 3.11+. The OpenCode engine is fetched automatically —
`run.py` calls `agentos.engine.ensure()`, which downloads the pinned build
(~60 MB) into a per-user cache the first time only. `agentos` never downloads
implicitly on its own; this app opts in from its bootstrap. To use an engine you
already have, set `AGENTOS_OPENCODE_BIN` or put `opencode` on PATH — both take
precedence over the cache.

## The Core boundary

`main.py` is the entire contract: one `AppConfig`, one `run()` call. Core reads
that object and nothing else app-specific.

Core is a dependency, not vendored source:

```toml
[tool.uv.sources]
agentos = { path = "../AgentOS", editable = true }
```

It's an editable path dep on the sibling AgentOS checkout during development;
for a standalone checkout use
`agentos @ git+https://github.com/Dekode1859/AgentOS@v0.2.0` instead.

Because the path dep is editable, **edits to `../AgentOS` take effect here
immediately** — convenient, and also a way for a Core change to break this app
without any commit in this repo.

**Never add domain knowledge to Core.** No jobs, resumes, profiles, or LinkedIn
anything in `agentos`. The test: would this make sense in a cooking-recipe app?
If not, it belongs here. To extend the JS↔Python surface, subclass `Bridge` in
`app_bridge.py` and pass it via `AppConfig.bridge_cls` — that's what
`PersonaBridge` exists for.

`apps/jobsearch-os` in the AgentOS repo is this app's frozen ancestor, kept only
as proof that Core runs more than one app. Do not port changes back to it.

## Scanner roadmap

The Scanner tab (`scanner/`, `app_bridge.py`) headlessly pulls jobs from the
user's logged-in LinkedIn session via the shared `workspace/browser-profile`
Chromium profile. LinkedIn selectors and URL construction live in
`scanner/linkedin_scan.py`, never in `agentos`. Scanned jobs land in
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
dependencies, PyInstaller for bundles.
