# KG1 VALUES and CORNERS provisioning

This package enables the new KG1 policy for the eight approved teacher/class/subject targets in `ay-1448`. It is intentionally limited to canonical `VALUES` and `CORNERS` offerings, their `SUBJECT_TEACHER` assignments, class links, and the corresponding operation access records derived from the canonical offering configuration.

It never unarchives, overwrites, or deletes historical KG1 records. In particular, an archived legacy offering is reported as history, not treated as an active canonical offering.

## Safety process

1. Run the read-only preview and inspect its timestamped JSON report.
2. Proceed only if `safeToApply` is `true`, with no conflicts or review-required entries.
3. Obtain explicit production approval.
4. Run the apply command with the exact preview report path. Apply rebuilds the read-only plan, compares its fingerprint with the approved preview, revalidates every planned document inside a Firestore transaction, and creates only absent documents.

The scripts use `scripts/service-account.json` (or `SERVICE_ACCOUNT_PATH`) and do not print its contents.

## Commands

Read-only preview:

```powershell
node scripts/kg1-values-corners/preview.cjs
```

Apply — requires explicit approval; do not run until the preview has been reviewed and approved:

```powershell
node scripts/kg1-values-corners/apply.cjs --apply --confirm=KG1_VALUES_CORNERS_AY1448 --preview="scripts/kg1-values-corners/reports/<preview-report>.json"
```

Reports are written to `scripts/kg1-values-corners/reports/`.
