<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/12c5decc-12fe-4b37-8569-db4955466d38

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Database (Supabase / Postgres)

Multi-organization data lives in a single Supabase Postgres. Every tenant table carries `tenant_id`,
primary keys are `(tenant_id, id)` and cross-table references are composite foreign keys, so the
database itself rejects links across organizations. RLS is enabled on every table with no policies
(the REST API is denied); only the Express server, connecting directly, reads and writes data.
The **SuperAdmin (Conta Mãe)** owns the catalog (`tenants`, `platform_admins`, `platform_audit_logs`)
and provisions client organizations through `/api/master/*`.

1. Set `SUPABASE_DB_URL` in `.env.local` (see `.env.example`).
2. Apply the schema: `npm run db -- migrate` (migrations live in `supabase/migrations/`).
3. Load the demo organizations (idempotent): `npm run db:seed`
4. Run the app: `npm run dev`

| Command | What it does |
| --- | --- |
| `npm run db -- ping` | Test the connection |
| `npm run db -- migrate` | Apply pending migrations (one transaction per file) |
| `npm run db -- status` | Show applied/pending migrations |
| `npm run db -- query "<sql>"` | Run a maintenance query |
| `npm run db:seed` | Create the demo organizations if missing |
| `npm run test:smoke` | End-to-end check against a running server (`BASE_URL`, default `http://localhost:3000`); creates and removes temporary orgs |

## Authentication & access

- **SuperAdmin (Conta Mãe)** is created automatically on first start (or `npm run db:seed`):
  `admin@admin.com.br` / `Admin@123` (override with `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD`).
  **Change the password after the first login**; a banner and a server warning remind you until you do.
- The SuperAdmin creates client organizations (`Criar Organização`); the initial organization admin receives a
  **one-time temporary password** and must replace it on first access. Org admins create users the same way.
  The SuperAdmin can also issue a new temporary password to an organization admin (key icon in the console).
- Login: e-mail + password (+ organization identifier for organization users). Passwords are stored as scrypt
  hashes, sessions are random tokens stored only as SHA-256 (revocable, 12h), repeated failures lock for 15 min.
- Organization users are **pinned to their organization by the server session**: headers/query params cannot switch
  organizations. Roles (`src/access.ts`) are enforced on every route: ORG_ADMIN, RECRUITER, HIRING_MANAGER,
  INTERVIEWER, COLLABORATOR. Only the SuperAdmin reaches `/api/master/*`.
- The public careers page (`/?view=careers&tenant=<slug>`) needs no login and only exposes open jobs; applications
  are rate limited and validated. Sensitive actions (logins, provisioning, status changes, password resets,
  SuperAdmin access to an organization, AI evaluations, public applications) are written to the audit trail.
- Without `GEMINI_API_KEY` the AI evaluation falls back to a local heuristic that is **explicitly labeled** as an
  estimate, not an AI assessment.
