# Member Private Usage Setup Prompt

Do not hand-edit this file for real teammate onboarding.

Use the generator instead:

```bash
node prepare_member_private_usage_setup.mjs \
  --member-id <id> \
  --member-name "<name>" \
  --team "<team>" \
  --role member \
  --email <email> \
  --server-url https://<reachable-host> \
  --view-url https://<reachable-host>/ai-usage/login \
  --seed-supabase true
```

That command writes:
- one private token bundle
- one fully filled setup prompt

under:
- `private_ops_seed/bootstrap_output/members/<member-id>/`
