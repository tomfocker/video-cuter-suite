# Three-Repo Dev Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single local-development entrypoint in `video-cuter-suite` for starting, stopping, logging, and checking the full source-based stack.

**Architecture:** Add shell scripts under `scripts/` that resolve sibling repo paths and wrap the existing dev compose files. Keep source ownership in the frontend and backend repos, and put only orchestration logic in `video-cuter-suite`.

**Tech Stack:** Bash, Docker Compose, Node test runner

---

### Task 1: Lock script behavior with tests

**Files:**
- Modify: `tests/dev-scripts.test.mjs`

- [ ] Write failing tests for missing sibling repos, unified startup command, and health checks.
- [ ] Run `node --test tests/dev-scripts.test.mjs` and confirm failure before implementation.

### Task 2: Add shared script environment

**Files:**
- Create: `scripts/common.sh`

- [ ] Implement path resolution for `video-cuter-suite`, `video-cuter`, and `funasr-server`.
- [ ] Add helpers for compose invocation, dry-run output, and path validation.

### Task 3: Add operator-facing commands

**Files:**
- Create: `scripts/dev-up`
- Create: `scripts/dev-down`
- Create: `scripts/dev-logs`
- Create: `scripts/dev-check`

- [ ] Implement source-based startup, shutdown, log tailing, and health probes.
- [ ] Keep all commands rooted in the existing `docker-compose.yml` and `docker-compose.dev.yml`.

### Task 4: Document the workflow

**Files:**
- Modify: `README.md`
- Create: `docs/superpowers/specs/2026-04-09-three-repo-dev-entry-design.md`

- [ ] Document the new local-development entrypoint and fixed sibling-directory convention.
- [ ] Point future debugging work at `video-cuter-suite` first.

### Task 5: Verify the whole flow

**Files:**
- Modify: `tests/dev-scripts.test.mjs`

- [ ] Run `node --test tests/dev-scripts.test.mjs`.
- [ ] Run a final repo-level verification command that covers the added tests.
