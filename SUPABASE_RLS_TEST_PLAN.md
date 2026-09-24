# Supabase RLS verification plan

> Apply `supabase/security-hardening.sql` only after the server API and identity model are live.

## Required checks

| ID | Client/request | Expected |
|---|---|---|
| SR-01 | publishable/anon read `admin_users` | DENY |
| SR-02 | publishable/anon read `plant_profiles` | DENY |
| SR-03 | publishable/anon read `gps_locations` | DENY |
| SR-04 | publishable/anon insert/update/delete any table | DENY |
| SR-05 | authenticated company A read company B resource | DENY |
| SR-06 | authenticated inactive user read/write | DENY |
| SR-07 | server API read/write with tenant predicate | ALLOW |
| SR-08 | server API request without tenant context | DENY |

## Verification

```bash
# Run from a controlled environment; do not print data bodies.
curl -i "$SUPABASE_URL/rest/v1/admin_users?select=*&limit=1" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

The first three anonymous checks must return an authorization error. Run the
same checks through two authenticated test tenants after applying the migration.

## Gate

Do not call the website production-safe until SR-01…SR-08 pass, the default
`admin/admin123` seed is absent, and no browser code uses the publishable key
for privileged writes.
