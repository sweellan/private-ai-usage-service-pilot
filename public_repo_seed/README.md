# AI Usage Upload Service

Public-repo-ready server and client for uploading local AI token usage reports with
member/admin RBAC.

## Scope
- Provide a reusable server/client codebase for AI coding usage upload.
- Keep the repository safe to publish on GitHub:
  - no real URLs
  - no real API keys
  - no private prompts
  - no deployment-specific nginx/systemd/OpenClaw secrets

## Current Status
- This repository contains the public code layer only.
- The current real-world deployment is still a separate private ops concern.
- Any existing online mock/self-test service should not be treated as the final
  production token schema rollout.

## Quick Start
1. Install Node.js 20 or newer.
2. Bootstrap an admin key:
   - `node server/admin_cli.mjs bootstrap-admin --state-file ./data/state.json --label owner`
3. Issue a member key:
   - `node server/admin_cli.mjs issue-member --state-file ./data/state.json --admin-api-key <admin-key> --member-id alice --member-name "Alice" --team Search`
4. Start the service:
   - `node server/run_token_usage_server.mjs --state-file ./data/state.json --port 3017 --host 127.0.0.1`
5. Initialize a member client:
   - `node client/cli.mjs init --server-base-url http://127.0.0.1:3017/ai-usage --api-key <member-key>`
6. Upload a local usage report:
   - `node client/cli.mjs sync --report-path ./tests/fixtures/alice_local_usage_report.json`

## Repository Layout
- `server/`: service implementation, login/setup pages, admin CLI
- `client/`: member-side CLI and config handling
- `shared/`: shared aggregation logic
- `docs/`: security boundary, RBAC notes, deploy/sync separation, publish notes
- `tests/`: self-contained repo-local tests and fixtures

## What Stays Out Of This Repo
- Real production/public hostnames
- Real ports used in private deployment
- Admin/member secrets
- Prompt packs
- OpenClaw-specific bridge instructions
- Private deployment configs

## Testing
- Run the full repo-local matrix:
  - `npm test`

## Publish Boundary
- Read [publish notes](./PUBLISH_NOTES.md) before creating a public GitHub repo.
- No `LICENSE` file is included yet by default.
- Until a license is chosen deliberately, treat the repository as source-visible but
  not open-licensed.
