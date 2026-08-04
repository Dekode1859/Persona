# Persona

A desktop app for building a structured profile of your work, tracking jobs
against it, and tailoring applications to each one.

Persona is an [AgentOS](../AgentOS) application: it supplies configuration and
domain assets, and the `agentos` package supplies the runtime — window, agent
execution, storage, providers, and the JS↔Python bridge. It ships its own UI
via `AppConfig.ui_dir` rather than using the shared chat UI.

## Run

```bash
make install
make run
```

Requires the `opencode` CLI on PATH (`curl -fsSL https://opencode.ai/install | bash`).
`make run` also installs Playwright's Chromium on first launch. No API key is
needed to start — the app defaults to a free OpenCode Zen model.

### Connecting a provider

Click **Settings** in the sidebar to paste an API key (Anthropic, OpenAI, …) or
pick a model. Credentials are stored in the app-local `.opencode-home/`, not in
`~/.opencode`, so this app is isolated from anything else using OpenCode on the
same machine. `make auth-setup` does the same thing from the CLI.

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

## How it consumes Core

`pyproject.toml` depends on `agentos[browser]`, resolved during development to
the sibling AgentOS checkout:

```toml
[tool.uv.sources]
agentos = { path = "../AgentOS", editable = true }
```

Switch that to
`agentos = { git = "https://github.com/Dekode1859/AgentOS", tag = "v0.2.0" }`
for a standalone checkout; nothing else in this repo changes. `main.py` imports `agentos` like any other
installed package — there is no `sys.path` manipulation and no vendored copy of
Core.

Core carries no knowledge of jobs, resumes, or profiles. Everything domain-
specific lives here, which is what makes the runtime swappable.

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
