.PHONY: help release check-version sync-version

# Use bash for safer scripting (process substitution, pipefail).
SHELL := /usr/bin/env bash

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
	  tag="v$$ver"; \
	  echo ">> releasing $$tag"; \
	  set -euo pipefail; \
	  if [ ! -d .git ]; then \
	    echo "Not a git repository (missing .git)."; \
	    exit 2; \
	  fi; \
	  if [ -n "$$(git diff --name-only --cached)" ]; then \
	    echo "You have staged changes. Please commit or unstage before running make release."; \
	    exit 2; \
	  fi; \
	  while IFS= read -r line; do \
	    [[ -z "$$line" ]] && continue; \
	    file="$${line:3}"; \
	    case "$$file" in \
	      package.json|package-lock.json|src-tauri/tauri.conf.json|src-tauri/Cargo.toml|src-tauri/Cargo.lock|Makefile|scripts/sync-version.mjs) ;; \
	      *) echo "Uncommitted change detected in '$$file'. Please commit/stash it first."; exit 2 ;; \
	    esac; \
	  done < <(git status --porcelain=v1); \
	  current="$$(node -p "JSON.parse(require('fs').readFileSync('package.json','utf8')).version")"; \
	  if [ "$$current" != "$$ver" ]; then \
	    echo ">> bumping package.json/package-lock.json to $$ver"; \
	    npm version "$$ver" --no-git-tag-version >/dev/null; \
	  else \
	    echo ">> package.json already at $$ver (skipping npm version)"; \
	  fi; \
	  echo ">> syncing src-tauri versions"; \
	  node scripts/sync-version.mjs --version "$$ver"; \
	  if command -v cargo >/dev/null 2>&1; then \
	    echo ">> updating src-tauri/Cargo.lock"; \
	    (cd src-tauri && cargo generate-lockfile >/dev/null); \
	  else \
	    echo ">> cargo not found; skipping Cargo.lock generation"; \
	  fi; \
	  git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml Makefile scripts/sync-version.mjs; \
	  if [ -f src-tauri/Cargo.lock ]; then git add src-tauri/Cargo.lock; fi; \
	  if git diff --cached --quiet; then \
	    echo ">> no version changes to commit"; \
	  else \
	    git commit -m "chore(release): $$tag" >/dev/null; \
	  fi; \
	  if git rev-parse -q --verify "refs/tags/$$tag" >/dev/null 2>&1; then \
	    echo ">> tag $$tag already exists; skipping tag creation"; \
	  else \
	    git tag "$$tag"; \
	  fi; \
	  echo ">> done: committed and tagged $$tag"

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
