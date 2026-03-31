# Publish Notes

## Purpose
This file is the pre-publish checklist for turning this directory into a public
GitHub repository without leaking private deployment details.

## What This Repo Is
- Public code for token-usage upload, member/admin RBAC, and basic setup/login UI
- Safe example env values
- Generic docs for security boundary and deployment separation

## What This Repo Is Not
- Not the private deployment repository
- Not the prompt pack
- Not the OpenClaw operations workspace
- Not proof that the current online mock/self-test service is already the final
  production token-schema deployment

## Hard Boundary
Do not commit any of the following:
- Real domains or public URLs
- Real deployment ports if they expose current ops topology
- Real API keys or bootstrap outputs
- Prompt text
- Private reverse-proxy or service-manager configs
- Real member reports or service state snapshots
- OpenClaw tunnel, SSH, gateway, or sync credentials

## License Default
- This repository intentionally ships without a `LICENSE` file for now.
- Without a license file, outside viewers do not automatically receive reuse or
  redistribution rights.
- This is safer than guessing an open-source license too early.
- Only add a license after an explicit decision.

## GitHub Readiness Checklist
- Confirm `npm test` passes inside this repo directory.
- Confirm `tests/` only contains fixtures or synthetic data.
- Confirm `.env.example` uses placeholder values only.
- Confirm docs do not mention real domains, ports, prompts, keys, or private ops steps.
- Confirm `git grep` shows no secrets or environment-specific URLs.
- Confirm private deployment instructions remain outside this repo.

## OpenClaw Boundary
OpenClaw comes later and only handles:
- pull/sync approved code
- apply private environment/config
- restart service
- run health checks

OpenClaw should not become the primary editor of this repository and should not
own the RBAC model.
