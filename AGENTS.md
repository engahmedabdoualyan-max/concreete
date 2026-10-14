# Project Instructions

## ⚠️ هام جداً / VERY IMPORTANT

**لا تغيّر تصميم الصفحة الرئيسية (Dashboard) إطلاقاً إلا إذا طلب منك صاحب المشروع ذلك صراحةً.**

Do NOT change the design of the main page / Dashboard unless the project owner explicitly asks for it.

- حتى لو في تغيير أو إصلاح يبدو "منطقي" — اسأل الأول.
- الموافقة على النشر أو التحديث لا تعني الموافقة على تغيير التصميم.
- أي سؤال أو لبس في التصميم → اسأل قبل ما تعدل.

## Context

- Live site: https://concrete.fimtosoft.com (Vercel project `concreete`).
- Active website source: `website-app/` (Vite React). Deploy via `/tmp/opencode/deploy-site` (`npx vercel deploy --prod`).
- The root `src/` copy contains the owner's older/customized live version — treat it as the reference for the owner's preferred UI.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
