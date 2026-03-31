# Service Queries

## Model
- End users do not query Supabase directly.
- The private service receives one `access_token`, hashes it, and resolves the principal from `ai_usage.principals`.
- The same token is used for:
  - upload
  - page/session bootstrap
  - role-based page selection

## Required Service-Side Lookups

### 1. Resolve principal from token
```sql
select principal_id, project_slug, member_id, member_name, team, role, revoked_at
from ai_usage.principals
where project_slug = :project_slug
  and token_hash = :token_hash
  and revoked_at is null
limit 1;
```

### 2. Append usage report
```sql
insert into ai_usage.usage_reports (
  project_slug,
  principal_id,
  member_id,
  member_name,
  team,
  hostname,
  client_version,
  report_generated_at,
  raw_hash,
  report,
  summary
) values (...);
```

### 3. Record audit event
```sql
insert into ai_usage.upload_events (
  project_slug,
  principal_id,
  member_id,
  event_type,
  payload
) values (...);
```

### 4. Member self page
```sql
select *
from ai_usage.latest_usage_reports
where project_slug = :project_slug
  and member_id = :member_id;
```

### 5. Admin aggregate page
```sql
select *
from ai_usage.latest_usage_reports
where project_slug = :project_slug;
```

## Aggregation Rule
- Use `ai_usage.latest_usage_reports` as the input set.
- Reuse the current local aggregation logic rather than inventing a new token schema.
- OpenClaw should periodically pull the latest set and render:
  - member page
  - admin overview
  - recent uploads/audit snippets

## Operational Rule
- `service_role` is only used inside the private service runtime.
- `publishable key` may exist in client code, but it is not sufficient for private data access in this architecture.
