"""
Persona - an AgentOS application.

A Profile ("About Me") workspace. Upload / paste candidate documents, extract a
structured profile via the `profile` agent, render and edit it, then track and
tailor applications against it.

Like every AgentOS app, this is only configuration + domain assets. Execution
(window, OpenCode runtime, storage, providers) comes from AgentOS Core, which
this repo consumes as the installed `agentos` package rather than as shared
source. This app ships its own UI (an About Me dashboard) via AppConfig.ui_dir.
"""
from pathlib import Path

from agentos import run, AppConfig, WorkspaceFolder

from app_bridge import PersonaBridge


APP = AppConfig(
    app_id="persona",
    app_title="Persona",
    app_root=Path(__file__).resolve().parent,
    ui_dir="ui",                      # this app ships its own front-end
    workspace_dirname="workspace",
    workspace_folders=(
        WorkspaceFolder("documents", "file-text", "documents"),
        WorkspaceFolder("profile",   "user",      "profile"),
    ),
    default_capture_folder="documents",
    default_agent="profile",
    bridge_cls=PersonaBridge,         # adds Scanner methods; see app_bridge.py
)


if __name__ == "__main__":
    run(APP)
