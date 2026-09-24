# Secret Rotation Runbook

>_No secret values belong in this file, Git, tickets, logs, or chat._

## Scope

Rotate credentials used by the API, integrations, authentication, mobile delivery, and hosting. ZATCA/Fatoora credentials are handled separately and are not required for this runbook.

## Safe rotation procedure

1. Create a staging/maintenance window and announce the affected service.
2. Identify the current secret version in the approved secret manager; never print it.
3. Generate a replacement with the provider's approved method.
4. Store the replacement in the target Vercel/Firebase/Supabase environment with the same scope as the old value.
5. Restart/redeploy the affected worker or API; do not rotate database schema in the same window unless explicitly planned.
6. Run the verification checklist below.
7. Revoke the old credential only after the new credential is proven.
8. Record timestamp, operator, affected environment, and ticket reference in the approved audit log.

## Credential groups

| Group | Rotate together | Verification |
|---|---|---|
| JWT access/refresh | `JWT_SECRET`, `JWT_REFRESH_SECRET` | login, `/api/auth/me`, refresh, logout, revoked session |
| SSO | SSO client secret and state secret | OIDC start/callback in staging |
| Integration crypto | `INTEGRATION_CRYPTO_KEY` | decrypt/re-encrypt one test connection; never log plaintext |
| OTP/console | `OTP_SALT`, `CONSOLE_CREDS_SALT`, EmailJS server credentials | request/verify OTP, cooldown, max attempts |
| Firebase | service account/private keys, Auth provider keys | emulator rules tests, then anonymous-denial checks |
| Supabase | service-role/project keys | anon denial and server-only tenant queries |
| Vercel | OIDC/deploy tokens | audit log, preview build, rollback artifact |
| EAS | signing/OTA credentials | signed build metadata and rollout channel |

## Verification checklist

- [ ] No old secret appears in `git diff`, logs, build output, or screenshots.
- [ ] Production health and auth smoke pass.
- [ ] Negative auth/tenant tests still fail closed.
- [ ] Existing sessions are either intentionally revoked or explicitly preserved.
- [ ] Backup/rollback path is known before revoking the old value.
- [ ] Provider audit log confirms the new value is active and the old value is revoked.

## JWT/session rotation

1. Deploy the new secrets to the API environment.
2. Verify new logins and refreshes.
3. Decide whether to revoke all legacy sessions. If yes, revoke them after a short overlap window.
4. Verify old access tokens and old refresh tokens fail.
5. Keep the previous secret only in the approved emergency rollback vault, never in source control.

## Integration encryption key rotation

1. Inventory encrypted connection/ZATCA-independent integration records.
2. Decrypt in a controlled staging job and re-encrypt with the new key.
3. Verify every required connection can be used.
4. Switch the runtime key.
5. Revoke the old key only after verification and retention requirements are satisfied.

Do not rotate an integration key while unreviewed production writes are in flight.

## Emergency revocation

If a secret may be exposed:

1. Revoke it at the provider immediately.
2. Deploy a fail-closed configuration or disable the affected integration.
3. Rotate dependent credentials.
4. Review provider and application audit logs.
5. Run negative tests and document the incident.

## Evidence

Store only redacted evidence:

```text
environment: staging | production
group: <credential group>
rotated_at: <timestamp>
operator: <approved operator id>
ticket: <ticket id>
old_revoked: true | false
verification: pass | fail
```

Never store the secret, token, private key, OTP, CSID, or full session token in the evidence.
