# Private Usage Operator Checklist v1

## What Works Now
- Local private service can run against Supabase
- One admin principal has been seeded into Supabase
- The current machine has already uploaded one real usage report
- Admin view can log in with the same private token and read the aggregate page

## Current Local Endpoints
- local login page: `http://127.0.0.1:8791/ai-usage/login`
- local admin API report: `http://127.0.0.1:8791/ai-usage/api/private-usage/admin/report`

## Files To Reuse
- admin token bundle:
  - `private_ops_seed/bootstrap_output/yc_admin_bundle.json`
- admin client config:
  - `private_ops_seed/bootstrap_output/yc_admin_client_config.json`
- daily sync wrapper:
  - `run_private_usage_daily_sync.sh`
- teammate prompt template:
  - `prompts/member_private_usage_setup_prompt.md`
- teammate ready-prompt generator:
  - `prepare_member_private_usage_setup.mjs`

## Daily Sync
- Yes, this can run daily.
- Current exact command:
  - `./run_private_usage_daily_sync.sh`
- Or with an explicit teammate config:
  - `./run_private_usage_daily_sync.sh /absolute/path/to/member_config.json`

## Important Constraint Before Teammates Can Really Upload
- The current service is running on this machine at `127.0.0.1:8791`.
- That is only reachable from this machine.
- Before teammates can upload from their own machines, this service must be deployed to a reachable host or tunneled path.

## Recommended Next Deployment Step
- Deploy the private service on the stable host side
- Then run the teammate generator with the real reachable URL
- Then send the generated prompt file directly to the teammate

## Expected Teammate Flow
1. Admin runs the teammate generator once
2. The generator issues one private token bundle and one fully filled prompt
3. Teammate agent runs `init`, `status`, `sync`, and installs daily sync
4. Teammate can repeat `sync` daily without reconfiguration
