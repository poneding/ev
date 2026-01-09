.PHONY: help release check-version sync-version

# Usage:
#   make release v1.2.3
#   make release 1.2.3
#   make check-version v1.2.3

help:
	@printf "%s\n" \
	  "Targets:" \
	  "  make release vX.Y.Z       Bump versions (package.json + tauri/cargo) without creating a reminder-prone manual edit" \
	  "  make check-version vX.Y.Z Validate versions match the given version" \
	  "" \
	  "Notes:" \
	  "  - Accepts vX.Y.Z or X.Y.Z" \
	  "  - 'make release' updates package.json/package-lock.json via npm version, then syncs src-tauri versions."

release: VERSION_ARG := $(strip $(filter-out release,$(MAKECMDGOALS)))
release:
	@if [ -z "$(VERSION_ARG)" ]; then \
	  echo "Usage: make release vX.Y.Z (or X.Y.Z)"; \
	  exit 2; \
	fi
	@ver="$(VERSION_ARG)"; ver="$${ver#v}"; \
	  echo ">> bumping version to $$ver"; \
	  npm version "$$ver" --no-git-tag-version

check-version: VERSION_ARG := $(strip $(filter-out check-version,$(MAKECMDGOALS)))
check-version:
	@if [ -z "$(VERSION_ARG)" ]; then \
	  echo "Usage: make check-version vX.Y.Z (or X.Y.Z)"; \
	  exit 2; \
	fi
	@ver="$(VERSION_ARG)"; ver="$${ver#v}"; \
	  echo ">> checking version $$ver"; \
	  node scripts/sync-version.mjs --check --version "$$ver"

sync-version:
	@node scripts/sync-version.mjs

# Prevent "No rule to make target v1.2.3" for the extra goal argument.
%:
	@:
