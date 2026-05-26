# Deploy HRM Backend on Render

Live URL: https://tionix-hrm-backend.onrender.com

## Required environment variables

Set in **Render Dashboard → tionix-hrm-backend → Environment**:

| Key | Value |
|-----|--------|
| `DB_DRIVER` | `postgres` |
| `DATABASE_URL` | **Session pooler** URI from Supabase (see below) |
| `JWT_SECRET` | your secret |
| `JWT_REFRESH_SECRET` | your refresh secret |
| `NODE_ENV` | `production` |

**Do not set:** `USE_HTTPS`, `PORT`, `MYSQL_HOST`, `MYSQL_*`

## DATABASE_URL — Supabase Session pooler (required)

Render does **not** support IPv6. The direct URL fails:

```text
❌ postgresql://postgres:PASS@db.doludlhcjnjyucgxmigg.supabase.co:5432/postgres
```

Use **Session mode** from Supabase:

1. [Supabase Dashboard](https://supabase.com/dashboard) → your project
2. **Connect** → **Session** (port **5432**)
3. Copy the **URI**

Correct shape:

```text
✅ postgresql://postgres.doludlhcjnjyucgxmigg:PASS@aws-0-REGION.pooler.supabase.com:5432/postgres
```

- Username: `postgres.doludlhcjnjyucgxmigg` (not just `postgres`)
- Host: `aws-0-REGION.pooler.supabase.com` (not `db....supabase.co`)

Save → **Manual Deploy**.

## Verify

```bash
curl https://tionix-hrm-backend.onrender.com/health/db
```

Expected: `"connected": true`, `"databaseHost": "...pooler.supabase.com"`

```bash
curl -X POST https://tionix-hrm-backend.onrender.com/login \
  -H "Content-Type: application/json" \
  -d '{"username":"BANTI","password":"LEFT"}'
```

## Local vs Render

| | Local Mac | Render |
|--|-----------|--------|
| URL | `https://192.168.1.5:5001` or `http://localhost:5001` | `https://tionix-hrm-backend.onrender.com` |
| DATABASE_URL | Direct `db.*.supabase.co` OK | **Pooler** URI required |
