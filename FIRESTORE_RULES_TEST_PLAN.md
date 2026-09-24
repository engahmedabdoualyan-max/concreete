# Firestore Rules negative-test plan

> These tests must run against the Firebase Emulator before deploying the checked-in rules.

## Required identities

- `anon`: no Firebase Auth token.
- `userA`: custom claims `{ tenantId: "tenant-a", role: "DRIVER", username: "a@example.com" }`.
- `userB`: custom claims `{ tenantId: "tenant-b", role: "DRIVER", username: "b@example.com" }`.
- `adminA`: custom claims `{ tenantId: "tenant-a", role: "OWNER" }`.

## Negative cases

| ID | Request | Expected |
|---|---|---|
| FR-01 | anonymous read `companyTrees/{company}` | DENY |
| FR-02 | anonymous read `users/{user}` | DENY |
| FR-03 | anonymous write `userData/tenant-a/orders/data` | DENY |
| FR-04 | userA read `userData/tenant-b/orders/data` | DENY |
| FR-05 | userA write `userData/tenant-b/orders/data` | DENY |
| FR-06 | userA write `companyTrees/company-b` | DENY |
| FR-07 | userA read `users/userB` | DENY |
| FR-08 | userA read `userData/tenant-a/orders/data` | DENY until the server-only cache contract is implemented |
| FR-09 | adminA write `companyTrees/company-a` | ALLOW only through a reviewed server/admin flow |
| FR-10 | userA read `siteConfig/main` (contains OTP hashes) | DENY |

## Emulator command

The local environment used for this repository did not have Java, so the Firestore
emulator could not start. Install Java 11+ or use a CI runner with Java, then run:

Start the emulator in CI/developer machine:

```bash
firebase emulators:start --only firestore --project demo-fimto
```

Then run the repository's rules test runner against `FIRESTORE_EMULATOR_HOST`.
The current checkout has the test matrix above but no Java/runtime test
runner yet; add the runner as a CI prerequisite before deploying the rules.

Do not use the production Firebase project for these tests.

## Deployment gate

Deploying `firestore.rules` is allowed only after:

1. server API uses Admin SDK or another trusted backend;
2. custom claims are issued and tested;
3. all FR-01…FR-10 cases pass;
4. anonymous production reads return `403`;
5. rollback command and previous rules are archived.
