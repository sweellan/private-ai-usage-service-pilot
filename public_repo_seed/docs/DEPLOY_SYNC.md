# Deploy Sync

## Intent
- Keep code editing in the local/public repo workflow.
- Keep deployment sync as a separate operations step.

## Expected Flow
1. Local maintainer updates code in the publishable repository.
2. CI or maintainer tags a deployable revision.
3. Remote deploy operator pulls the approved revision.
4. Remote deploy operator updates:
   - environment variables
   - reverse proxy config
   - service manager config
5. Remote deploy operator runs health checks.

## Rules
- Do not edit production-only service code directly on the deployment host.
- Do not store real domains, ports, or secrets in the public repository.
- Do not store prompt packs in the public repository.

## OpenClaw Role
- Pull approved code
- Apply private deployment config
- Restart service
- Run health checks
- Report back URLs and status
