# R&D Module Implementation Plan

> التفاصيل الكاملة بمنهجية PMP في `RND_PMP_PLAN.md`.

## Phase 1: Core Types & Roles
- [x] 1. Add R&D Manager role to mobile types (types/index.ts)
- [x] 2. Add R&D Manager role to web AdminContext (AdminContext.tsx) — `rnd_manager` 🧠
- [x] 3. Add R&D module permissions in AdminContext — `rnd_manager`: rnd + evaluation + orders

## Phase 2: Mobile R&D Types & API
- [x] 4. Create R&D mobile types (`mobile/types/rnd.ts`)
- [x] 5. Create R&D API client (`mobile/lib/rnd-api.ts`)
- [x] 6. Create R&D store — Zustand + offline cache (`mobile/store/rnd-store.ts`)

## Phase 3: Mobile R&D Screens (`mobile/app/(rnd)/`)
- [x] 7. Main R&D Dashboard (`index.tsx`) — KPIs + nav grid + tasks preview
- [x] 8. Current State Input (`current-state.tsx`)
- [x] 9. Development Plan Creation (`development-plan.tsx`)
- [x] 9b. Plan Detail 360° view (`plan-detail.tsx`)
- [x] 10. Task Assignment & Tracking (`task-assignment.tsx`)
- [x] 11. Budget/Financial Planning (`budget-planning.tsx`)
- [x] 12. Weekly Tracking (`weekly-tracking.tsx`)
- [x] 13. External Tasks — off-plan issues (`external-tasks.tsx`)
- [x] 14. Employee Evaluation (`employee-evaluation.tsx`)
- [x] 14b. Reports (`reports.tsx`) + Profile (`profile.tsx`)

## Phase 4: Navigation & Integration
- [x] 15. R&D route group in mobile navigation (`app/_layout.tsx` + `(rnd)/_layout.tsx`)
- [x] 16. Translations: EN + AR + UR (161 R&D keys, 250 total — identical sets)

## Phase 5: Web Admin Integration
- [x] 17. R&D Manager role in Admin panel user management (Admin.tsx — 🧠 + label)
- [x] 18. Web translations for R&D Manager role — EN `R&D Manager` + AR `مدير البحث والتطوير`
- [x] 19. R&D Manager permissions in AdminContext (rnd, evaluation, orders)

## Phase 6: Backend
- [x] 20. R&D tables in schema (`src/db/schema.ts`) — 9 enums + 11 tables + relations + types
- [x] 20b. `RND_MANAGER` in `userRoleEnum`
- [x] 20c. Migration `drizzle/0001_rnd_module.sql` + journal entry
- [x] 21. R&D service layer (`src/lib/services/rnd.service.ts`)
- [x] 21b. 17 API routes under `src/app/api/rnd/*`
- [x] 21c. RBAC: `RND_READ`, `RND_WRITE`, `RND_APPROVE`, `RND_FINANCE_APPROVE` + `rnd` module map
- [x] 21d. `scripts/create-user.ts` accepts `--role RND_MANAGER`

## Phase 7: Verification
- [x] 22. Syntax check (tsc) — mobile R&D files: clean
- [x] 23. Syntax check (tsc) — backend R&D files + schema + rbac: clean
- [x] 24. i18n key parity EN/AR/UR verified by script
- [ ] 25. Full `tsc --noEmit` + `next build` after `npm install` (requires node_modules/DB)
- [ ] 26. Apply migration: `npx drizzle-kit migrate` (requires DATABASE_URL)

## Phase 8: Competitor Intelligence + Competitive Epics 🏆
- [x] 27. Schema: `rnd_competitors` + `rnd_competitor_products` + migration `0002`
- [x] 28. Service `rnd-competitor.service.ts` (CRUD + auto verdict + market view)
- [x] 29. 5 API routes (competitors, products, comparison)
- [x] 30. Mobile screen `competitor-analysis` + tile + 16 i18n keys × 3 locales
- [x] 31. Epic 1 — Customer notifications (`notification.service.ts` + checkpoint hook + env)
- [x] 32. Master roadmap `COMPETITIVE_ROADMAP.md` (11 epics prioritized)

## Phase 9: Epic 2 — Customer Self-Service Portal 🥈
- [x] 33. Schema: `share_tokens` (ORDER|CLIENT magic links) + migration `0003`
- [x] 34. Service `portal.service.ts` (issue + public resolve + statements)
- [x] 35. 3 API routes: `/api/portal/share` (issue/list) + revoke + public `/api/public/portal/[token]`
- [x] 36. Web public page `#/track/:token` (live timeline + tickets + statement / client home)
- [x] 37. Mobile sales share button (WhatsApp + copy link) + `shareOrder`/`shareClientPortal` API + i18n

## Phase 10: Epic 3 — E-Signature & Paperless Ticket 🥉
- [x] 38. Schema: `trips.signature_image/signed_by/signed_at` + migration `0004`
- [x] 39. Service `saveTripSignature` + `POST /api/dispatch/[tripId]/signature` + audit
- [x] 40. `hasSignature` in my-active + full image in public portal payload
- [x] 41. Mobile: SignaturePad + `(driver)/sign` + DEP_SITE prompt + deps + i18n
- [x] 42. Web portal signature badge + image display

## Phase 11: Epic 4 — Smart Dispatch Optimization 🧠
- [x] 43. Engine `dispatch-optimization.service.ts` (greedy + sequencing + Haversine, no native deps)
- [x] 44. `POST /api/dispatch/optimize` (preview) + `.../optimize/apply` (via createTrip)
- [x] 45. `predictEtaMinutes` (site history ≥3 else distance/speed + live elapsed adjust)
- [x] 46. `GET /api/dispatch/eta/[tripId]` + ETA wired into notifications + portal badge

## Phase 12: Epic 5 — Drum Telematics IoT 🥁
- [x] 47. Schema: `telematics_devices` + `telematics_readings` + migration `0005`
- [x] 48. Service `telematics.service.ts` (ingest + trip telemetry + workability + rotation stops)
- [x] 49. `POST /api/v1/telematics/ingest` (key + rate limit) + `GET /api/dispatch/[tripId]/telemetry`
- [x] 50. Mobile driver workability banner + portal drum QA chip + i18n + env

## Phase 13: Epic 6 — External Accounting Integrations 💼
- [x] 51. Schema: `integration_connections` (encrypted) + `integration_sync_logs` + migration `0006`
- [x] 52. Connectors: Zoho Books + QuickBooks Online + CSV Bridge + AES-256-GCM
- [x] 53. Service `accounting-sync.service.ts` (auto customer-first invoice push + CSV export)
- [x] 54. 7 API routes: connections/test/push-customer/push-invoice/logs/export
- [x] 55. Web page `/integrations` (manage + test + push + CSV download + audit log)

## Phase 14: Epic 7 — ZATCA Phase-2 Deepening 🧾
- [x] 56. Schema: `zatca_documents` (hash chain + counter) + migration `0007` + tenant taxpayer config
- [x] 57. Service `zatca.service.ts` (UBL 2.1 + TLV QR + SHA-256 + Fatoora clearance/reporting + PENDING mode)
- [x] 58. 4 API routes: config/issue/documents/status
- [x] 59. Web page `/zatca` (taxpayer setup + issue + registry + acceptance stats)

## Phase 15: Epic 8 — Enforced-Margin RFQ + Commissions 💰
- [x] 60. Schema: `rfqs` + `rfq_items` (costs + margin + floor) + schemes + commissions + migration `0008`
- [x] 61. `RFQ_APPROVE` permission (Plant Mgr) + service `rfq.service.ts` (auto material estimate + margin gate + convert)
- [x] 62. 9 API routes: rfq/items/convert/schemes/commissions/status
- [x] 63. Web page `/quoting` (quotes + costing + approve + convert + schemes + commission preview/approve)

## Phase 16: Epic 9 — GCC Payroll (GOSI + Mudad) 💵
- [x] 64. Schema: `payroll_employees` + `payroll_runs` + `payroll_lines` + migration `0009`
- [x] 65. `HR_READ`/`HR_WRITE` permissions + service `payroll.service.ts` (dual-track GOSI engine + cap + Mudad CSV + payslips)
- [x] 66. 7 API routes: employees/runs/status/export/payslip
- [x] 67. Web page `/payroll` (employees + runs + GOSI math table + Mudad download)

## Phase 17: Epic 10 — Direct PLC Integration 🏭
- [x] 68. Real Modbus-TCP client (FC03/FC16) + provider framework (Modbus/HTTP-Gateway/Simulator) + register maps
- [x] 69. Schema: `batch_controllers` + migration `0010` + service (secret sanitizing + live snapshots)
- [x] 70. 5 API routes: registry/test/live-status/ticket-weights
- [x] 71. Web page `/batch-control` (register + probe + live + ticket)

## Phase 18: Epic 11 — Multi-Material + Carbon + SSO 🏁
- [x] 72. Schema: `product_type` enum + columns + `carbon_factors` + order snapshot + migration `0011`
- [x] 73. Service `sustainability.service.ts` + 3 API routes + web page `/sustainability`
- [x] 74. Service `sso.service.ts` (full OIDC: discovery + PKCE + JWKS + ERP session, zero new deps)
- [x] 75. 4 SSO API routes + web page `/sso` (IdP registry)

## Phase 19: Epic 12 — HR Social + Geofence Attendance 💬
- [x] 76. `HR_OFFICER` role everywhere (DB enum + RBAC + mobile + web tree + create-user)
- [x] 77. Schema: requests/broadcasts/reads + zones/attendance + migrations `0012/0013`
- [x] 78. Expo Push service + token register + event pings (new/review/broadcast)
- [x] 79. 13 API routes: HR desk + broadcasts + push + zones + ping/reports/overtime
- [x] 80. Mobile `(hr)` group + HrFab on all screens + HeaderActions (profile+logout) on all headers + auto ping + i18n
- [x] 81. Web: attendance tab in `/payroll` (zones + report + driver overtime) + `hr` role/module
