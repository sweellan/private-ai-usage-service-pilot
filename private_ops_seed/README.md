# Private Ops Seed

This folder is the private counterpart to `public_repo_seed/`.

## Purpose
- Keep the real data plane in Supabase
- Keep the public repository free of secrets, prompts, and deployment topology
- Let each member use one private access token for both upload and page access
- Let OpenClaw act as the display/sync layer instead of being the system of record

## Boundary
- Safe here:
  - Supabase schema SQL
  - private env examples
  - token issuance scripts
  - private prompt templates
  - service-side code that expects `service_role`
- Must stay out of `public_repo_seed/`:
  - real service_role key
  - real deployment hostnames
  - real prompts with live tokens
  - real per-member tokens

## Intended Flow
1. Admin creates one Supabase project for AI usage only.
2. Admin seeds project metadata and principals into Supabase.
3. Admin issues one private access token per principal.
4. Each member agent gets a private prompt/config bundle with:
   - ingest URL
   - view URL
   - member metadata
   - one private access token
5. Member agent uploads usage reports without any manual browser login.
6. OpenClaw or another private service reads from Supabase and renders:
   - member self page
   - admin aggregate page

## Current Files
- `supabase/schema.sql`: canonical schema for the private data plane
- `supabase/service_queries.md`: service-side access pattern and aggregation rules
- `env.private.example`: private runtime env contract
- `prompts/member_agent_prompt.template.md`: private prompt template for member-side agent setup

## Current Decision
- No direct client-to-Supabase table access for end users
- No `service_role` in user prompts or public repo
- One principal, one access token, one role
- Display differences are enforced by the private service layer
