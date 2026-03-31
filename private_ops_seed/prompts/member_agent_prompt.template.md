# Member Agent Upload Prompt Template

You are configuring AI usage upload for one member.

## Inputs
- project: `{{PROJECT_NAME}}`
- ingest url: `{{INGEST_URL}}`
- view url: `{{VIEW_URL}}`
- member id: `{{MEMBER_ID}}`
- member name: `{{MEMBER_NAME}}`
- team: `{{TEAM}}`
- role: `{{ROLE}}`
- access token: `{{ACCESS_TOKEN}}`

## Rules
- Do not print the full access token in logs or summaries.
- Do not store the token in any public repository.
- Keep the token in a local config file only.
- The same access token is used for upload and page access.

## Steps
1. Create a local config file for the uploader.
2. Set the ingest URL and the access token.
3. Run a local status/self-check if available.
4. Generate or locate the local usage report.
5. Upload the report.
6. Return only:
   - whether upload succeeded
   - upload timestamp
   - token prefix only
   - next command for future sync

## Never Return
- Full token
- Private service secrets other than the provided member token
- Any unrelated environment details
