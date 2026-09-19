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
- **Conta Mãe controls** (routines: Visão geral, Organizações, Usuários, Auditoria): edit organizations (data, plan, status)
  and the **modules each organization may use** (`tenants.enabled_routines`; plan presets in `src/access.ts`; a member's
  effective permission = (profile + exceptions) ∩ enabled modules, so a blocked module neither shows nor answers); create
  people, link them to organizations and set profiles/exceptions. Only access metadata is exposed, never business data.
- **Scale**: sessions and tenant rows are cached for a few seconds on the request hot path (cleared after every
  access/tenant write, so changes are immediate on the instance); storage is measured only for the tenants on the page
  being shown; every platform list (organizations, people, members, audit) is searched and paginated in the database
  (prefix indexes, keyset cursor for the audit trail, page size capped at 100).
- The **Conta Mãe has its own environment** (Visão geral, Organizações, Auditoria) and no route into organization
  data: `/api/v1/*` refuses it. Manual validation guides: `docs/validacao-*.md`.
- Login: e-mail + password (organization identifier is optional). Passwords are stored as scrypt
  hashes, sessions are random tokens stored only as SHA-256 (revocable, 12h), repeated failures lock for 15 min.
- **Users, organizations and permissions (RBAC)**:
  - A person is ONE global identity (`app_users`: e-mail + password) **linked** to one or more organizations
    (`tenant_users`, one row per link). Giving one person access to a SECOND organization is a Conta Mãe-only action
    (an organization admin can only register e-mails that are new to the platform; the server answers 403 otherwise).
    Linking an existing account never touches its password;
    the person switches organization from the header without logging in again.
  - Each organization has **access profiles** (`access_profiles`): sets of `routine:action` permissions
    (`view`, `create`, `edit`, `delete` per routine, catalog in `src/access.ts`). Five default profiles are created with
    every organization (Administrador, Recrutador, Gestor da Vaga, Entrevistador, Colaborador); admins can edit them
    (except Administrador, which always holds everything) and create new ones under Usuários e Permissões > Perfis.
  - A link has one profile plus optional **individual exceptions** (granted/revoked permissions).
  - Every route is guarded by `can('<routine>:<action>')`; permissions are read fresh on each request, so profile and
    exception changes apply immediately. Guards: nobody can hand out (or manage someone who holds) permissions they
    do not hold, nobody edits their own access, the last active administrator is protected, and an org admin cannot
    reset the password of a person who is also linked to other organizations (the password is per person).
- Organization users are **pinned to the active organization of their session** (headers/query params cannot switch
  organizations; only `POST /api/auth/switch-organization` to an organization they are linked to). Only the SuperAdmin
  reaches `/api/master/*`.
- The public careers page (`/?view=careers&tenant=<slug>`) needs no login and only exposes open jobs; applications
  are rate limited and validated. Sensitive actions (logins, provisioning, status changes, password resets,
  SuperAdmin access to an organization, AI evaluations, public applications) are written to the audit trail.
- Without `GEMINI_API_KEY` the AI evaluation falls back to a local heuristic that is **explicitly labeled** as an
  estimate, not an AI assessment.
