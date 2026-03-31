# RBAC

## Roles
- `admin`
- `member`

## Rules
- Members can only read their own usage data.
- Admins can read global dashboards and all member records.
- Upload APIs accept member-scoped credentials only.
- Key issuance and revocation are admin-only.

## Non-Goals
- This model does not claim to make local client data impossible to forge.
- It only enforces read/write boundaries at the service layer.
