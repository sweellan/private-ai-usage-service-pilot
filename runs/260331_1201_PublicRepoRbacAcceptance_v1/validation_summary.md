# Validation Summary

## Result
- status: pass
- validation_mode: node_test_fixture_acceptance

## Command
- `node --test tests/public_repo_token_rbac.test.mjs`

## Assertions
- admin bootstrap key can be created
- admin can issue member keys
- member upload succeeds
- member can read self data only
- member is forbidden from admin dashboard
- admin can read global dashboard
- setup page does not expose real keys
- public-repo-ready client can sync a real token report into the RBAC server

## Outcome
- tests: `5/5 pass`
- schema focus: `token usage`, not `linesAdded/linesDeleted`
- auth focus: `member self-only + admin global`
- repo boundary focus: `secretless public repo seed`
