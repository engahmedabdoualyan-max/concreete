# Firebase migration scripts

These scripts are read/migration helpers, not a production authentication
path. They redact credentials and PII from generated reports.

- Generated reports and `inspect-out/` are ignored and must never be committed.
- `migration-credentials.local.json` is an ignored mode-0600 handoff file; deliver
  its contents through a controlled channel and delete it after use.
- Before running against live data, obtain explicit approval, use a read-only
  dry run, and rotate any credential that may have been exposed.
- After Firebase Rules are deployed, these public REST reads will be denied;
  use a trusted service account/migration job instead.
