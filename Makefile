.PHONY: run install auth-setup auth-status

install:
	uv sync

run:
	uv run python run.py

auth-setup:
	@mkdir -p .opencode-home
	HOME="$(CURDIR)/.opencode-home" opencode providers login

auth-status:
	@mkdir -p .opencode-home
	HOME="$(CURDIR)/.opencode-home" opencode providers list
