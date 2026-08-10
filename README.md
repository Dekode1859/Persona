# Persona

A desktop app for building a structured profile of your work, tracking jobs
against it, and tailoring applications to each one.

Persona is a [Spiritus](../spiritus) application: it supplies configuration and
domain assets, and the `spiritus` package supplies the runtime — window, agent
execution, storage, providers, and the JS↔Python bridge. It ships its own UI
via `AppConfig.ui_dir` rather than using the shared chat UI.

## Run

```bash
uv sync
uv run python run.py
```

For a source checkout, the bootstrap installs the pinned OpenCode engine and
Playwright's Chromium on first launch. The packaged Windows and macOS releases
already include both, so they do not require a separate OpenCode installation.
No API key is needed to start — the app defaults to a free OpenCode Zen model.

### Connecting a provider

Click **Settings** in the sidebar to paste an API key (Anthropic, OpenAI, …) or
pick a model. Credentials are stored in the app-local `.opencode-home/`, not in
`~/.opencode`, so this app is isolated from anything else using OpenCode on the
same machine. Provider setup is available from the Settings panel.

## Layout

| Path | Contents |
|------|----------|
| `main.py` | The whole Core↔app contract: one `AppConfig`, one `run()` call. |
| `opencode.json` | Agent definitions (`profile`, `jd-match`, `job-extract`, `resume-composer`, `profile-writer`, `headline-writer`) and the active model. |
| `app_bridge.py` | `PersonaBridge` — extends Core's `Bridge` with Scanner methods. |
| `scanner/` | LinkedIn scan: URL/facet construction, card parsing, feed store. |
| `ui/` | The front-end (vanilla JS, Shoelace, Lucide). No build step. |
| `schemas/` | JSON schemas for the profile and job records. |
| `workspace/` | User data — documents, profile, jobs, browser profile. Gitignored. |

## How it consumes Spiritus

`pyproject.toml` depends on Spiritus `v0.0.33` with its bundle extra directly
from the Git tag and on Playwright. `main.py` imports `spiritus` like any other installed package —
there is no `sys.path` manipulation and no vendored copy of the Spiritus
runtime.

The release build delegates PyInstaller bundle assembly and manifest
verification to Spiritus. Persona supplies its UI, configuration, OpenCode
engine payload, and Playwright browser payload through `spiritus.bundle.toml`.
The resulting bundle ships Spiritus, the pinned OpenCode engine, Chromium, and
Persona's resources in one Windows installer or macOS DMG. Installed app data
and credentials remain in the platform's normal per-user application-data
folder.
Public releases use the clean `v<version>` tag and `Persona <version>` title;
CI build numbers are not exposed in the release name.

Persona also uses Spiritus's update configuration to check the public GitHub
release from Settings. The first updater milestone is intentionally check-only:
it reports the latest fetched Persona version without downloading or launching
an installer.

Spiritus carries no knowledge of jobs, resumes, or profiles. Everything domain-
specific lives here, which keeps the runtime reusable.

## Scanner

The Scanner tab pulls jobs from your logged-in LinkedIn session using the shared
`workspace/browser-profile` Chromium profile. Scanned results land in
`workspace/jobs/scanner-feed.json`, separate from tracked jobs in `jobs.json`,
until you promote them.

Currently manual only — a "Scan now" button that reads the recommended feed plus
any configured keyword/location searches, deduped on card-level fields. Running
on a schedule while the app is closed, desktop notifications, and full per-job
detail extraction are all deliberately unbuilt; see the roadmap notes in
`CLAUDE.md` before starting any of them.
