# Three-Repo Dev Entry Design

## Goal

Keep the current three-repo split, but make local development feel like one project by treating `video-cuter-suite` as the single entrypoint for source-based startup, logs, and health checks.

## Decision

- `video-cuter` keeps frontend source ownership.
- `funasr-server` keeps backend source ownership.
- `video-cuter-suite` becomes the only local development control surface.

## Developer Workflow

Run every local integration task from `video-cuter-suite`:

- `scripts/dev-up`
- `scripts/dev-down`
- `scripts/dev-logs`
- `scripts/dev-check`

These scripts assume the three repos live side-by-side under the same parent directory and fail fast with clear path errors if that assumption is broken.

## Why This Direction

This preserves release boundaries and source ownership while removing the biggest local-debugging cost: remembering which repo to enter and how to start each piece. It also gives integration bugs one stable home for startup instructions, logs, and health checks.
