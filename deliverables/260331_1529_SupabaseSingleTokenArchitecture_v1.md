# Supabase Single Token Architecture v1

## Decision
- Move the source of truth from OpenClaw-local state to a dedicated Supabase project: `BA_Agent_team`
- Keep OpenClaw as the display/sync layer, not the durable database
- Use one private access token per principal for both:
  - upload
  - page/session bootstrap
- Do not require members to perform manual browser login or OTP during initial agent setup

## Why This Direction
- OpenClaw host state is operationally fragile because the host is frequently changed
- Supabase is a better durable data plane
- A single token model is better for agent-driven deployment than separate upload/login flows
- Public repo boundary stays clean:
  - no service_role
  - no real tokens
  - no private prompts

## Boundary

### Public repo
- upload client code
- token-safe docs
- generic server/view code
- no real private tokens

### Private ops layer
- Supabase schema
- service_role usage
- real per-member private access tokens
- private member prompts
- OpenClaw deployment sync

## Chosen Auth Model
- One principal has one role and one private token
- Roles:
  - `member`
  - `admin`
- Same token is used to:
  - authenticate upload requests
  - bootstrap a private page/session
  - select self page vs admin page

## Why Not Supabase Auth For This Phase
- It would force manual browser/email steps into the member onboarding flow
- The user explicitly wants agent-first setup with preconfigured member info in prompts
- A private service token model better matches the current delivery requirement

## Data Plane
- Supabase project URL: `https://czkkkwfgcfjiyamqwtcq.supabase.co`
- Public client key: already available, but not sufficient for private data access
- Required private secret still missing for live setup:
  - `SUPABASE_SERVICE_ROLE_KEY`

## Canonical Tables
- `ai_usage.projects`
- `ai_usage.principals`
- `ai_usage.usage_reports`
- `ai_usage.upload_events`
- `ai_usage.latest_usage_reports` view

## End User Flow
1. Admin issues one private token bundle for a member
2. Member agent receives a private prompt/config bundle
3. Member agent uploads local usage reports with that token
4. OpenClaw or another private service reads Supabase and renders the appropriate page
5. Member token sees only self data
6. Admin token sees aggregate data

## OpenClaw Role
- pull approved code
- run display sync jobs against Supabase
- render admin/member pages
- do health checks
- do not become the source of truth

## Immediate Deliverables Added In This Turn
- `private_ops_seed/supabase/schema.sql`
- `private_ops_seed/supabase/service_queries.md`
- `private_ops_seed/env.private.example`
- `private_ops_seed/prompts/member_agent_prompt.template.md`
- `issue_private_access_token_bundle.mjs`

## What Is Still Blocked
- Live Supabase schema creation
- live principal seeding
- live private service deployment

## Exact Missing Secret
- `SUPABASE_SERVICE_ROLE_KEY`

## Next Action Once Secret Is Available
1. Apply `private_ops_seed/supabase/schema.sql`
2. Insert project row for `ba_agent_team`
3. Issue first admin token bundle for `yc.thu08@gmail.com`
4. Stand up the private ingest/view service
5. Let OpenClaw switch to Supabase-backed display sync
