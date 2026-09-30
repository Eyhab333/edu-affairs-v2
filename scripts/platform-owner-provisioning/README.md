# Platform Owner Provisioning

This folder provisions the two high-privilege organization accounts as `platform_owner`.

It intentionally does **not** create:
- teacherAssignments
- operationalAssignments
- personSupervisionScopes

It intentionally does **not** modify:
- guardians
- guardianLinks

For an existing Guardian account, it preserves `users/{uid}.personId`. Guardian access remains linked through the existing person/guardian/guardianLinks structure.

## Files

- `targets.local.example.json` — safe template.
- `targets.local.json` — local secrets/config; ignored by Git.
- `inspect-platform-owners.cjs` — read-only current-state inspection.
- `preview-platform-owners.cjs` — read-only planned changes and safety checks.
- `apply-platform-owners.cjs` — writes Auth/User/Person/Membership.
- `verify-platform-owners.cjs` — read-only post-apply verification.
- `_shared.cjs` — shared implementation.

## Prerequisite

The repository must already contain:

`./scripts/service-account.json`

Run commands from the repository root, for example:

`C:\dev\edu-affairs-v2`

## Setup

PowerShell:

```powershell
Copy-Item `
  .\scripts\platform-owner-provisioning\targets.local.example.json `
  .\scripts\platform-owner-provisioning\targets.local.json
```

Open:

```powershell
notepad .\scripts\platform-owner-provisioning\targets.local.json
```

Fill only the missing values:
- Chairman `nationalId`.
- CEO `displayName`.
- CEO `nationalId`.
- If the CEO Firebase Auth account already exists and you know its UID, you may also fill `expectedUid`. Otherwise leave it empty.

`nationalId` is used as the temporary Firebase Auth password on APPLY. The scripts never print the national ID/password and reports redact it.

## Run order

### 1) Inspect

```powershell
node .\scripts\platform-owner-provisioning\inspect-platform-owners.cjs
```

Expected: no writes.

### 2) Preview

```powershell
node .\scripts\platform-owner-provisioning\preview-platform-owners.cjs
```

Only continue when the last output contains:

`SAFE_PREVIEW`

### 3) Apply

```powershell
node .\scripts\platform-owner-provisioning\apply-platform-owners.cjs --confirm=PLATFORM_OWNER
```

This will:
- reuse the existing Chairman Firebase Auth account;
- preserve the Chairman current `personId`;
- reset the configured accounts' temporary passwords to their national IDs;
- create the CEO Auth account only if it does not already exist;
- upsert `users/{uid}`;
- upsert `orgs/takween/people/{personId}`;
- set `users/{uid}/orgMemberships/takween` to `platform_owner`;
- set `scopes.canAccessAllSchools = true`;
- grant the same broad permission map used by the platform-owner account.

### 4) Verify

```powershell
node .\scripts\platform-owner-provisioning\verify-platform-owners.cjs
```

Expected:

`VERIFY PASSED.`

For the Chairman, verification also confirms the guardian records and guardian links are still discoverable.

## Important

After successful login, change both temporary passwords.

Do not commit:
- `targets.local.json`
- `reports/`

The local `.gitignore` in this folder already excludes both.
