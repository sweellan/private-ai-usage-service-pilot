# Security Boundary

## Public Repo
- Safe to clone
- Safe to inspect
- No secrets
- No private prompts

## Private Ops Layer
- Real domains
- Deployment configs
- Secrets
- Admin runbooks
- Prompt packs

## Important Boundary
If contributors fully control their local machines, absolute anti-tamper is not possible.
The server should therefore focus on:
- append-only audit trails
- validation
- anomaly detection
- permission enforcement
