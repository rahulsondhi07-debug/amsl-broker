# Deploying to Render

The app deploys as **one** Render Web Service: the backend builds the React UI and then serves
the UI + API together on the port Render assigns. No CORS or API-URL configuration is needed.

There are two ways to do it — the Blueprint (recommended, uses `render.yaml`) or manual setup.

---

## Prerequisites

1. A free [Render](https://render.com) account.
2. This project pushed to a **GitHub or GitLab repo**, with the repo root being the folder that
   contains `package.json`, `render.yaml`, `amsl-backend/` and `amsl-frontend/`.

Push it:

```bash
cd amsl-broker            # the folder with package.json + render.yaml
git init
git add .
git commit -m "AMSL Broker app"
git branch -M main
git remote add origin https://github.com/<you>/amsl-broker.git
git push -u origin main
```

---

## Option A — Blueprint (recommended)

1. In the Render dashboard: **New +  →  Blueprint**.
2. Connect your repo. Render detects `render.yaml` and shows the `amsl-broker` service.
3. Click **Apply**. Render runs:
   - build: `npm install && npm run build`
   - start: `npm --workspace amsl-backend start`
4. When it goes live you'll get a URL like `https://amsl-broker.onrender.com`.
   Open it → the login screen loads (seeded accounts below). The database seeds itself on first boot.

---

## Option B — Manual (no render.yaml)

**New +  →  Web Service**, connect the repo, then set:

| Field | Value |
|-------|-------|
| Runtime | Node |
| Build Command | `npm install && npm run build` |
| Start Command | `npm --workspace amsl-backend start` |
| Health Check Path | `/health` |
| Environment Variable | `NODE_VERSION` = `22.12.0` |

Create the service. Same result as the Blueprint.

---

## Sign in

| Email | Password | Role |
|-------|----------|------|
| admin@brokerportal.com | admin123 | Admin |
| lawrence.nadar@azentratech.com | changeme | Super User |

---

## Notes

- **Free plan**: the instance sleeps after ~15 min idle and cold-starts on the next request (a few
  seconds). The filesystem is ephemeral, so the SQLite DB re-seeds on every deploy/restart — great
  for a shareable demo, but data you add won't survive a restart.
- **Persistent data**: upgrade the service to a paid instance (e.g. *Starter*), then in `render.yaml`
  uncomment the `disk:` block and the `DB_PATH` env var (`/var/data/amsl.db`). Redeploy — the
  database now lives on the mounted disk and persists.
- **Reseed / reset data**: open the service's **Shell** in Render and run
  `npm --workspace amsl-backend run seed` (add `-- --reset` to wipe and rebuild).
- **better-sqlite3** installs a prebuilt binary for Render's Linux/x64 environment during
  `npm install`, so there's no native compilation step.
- **Custom domain / HTTPS**: Render gives you free HTTPS on the `onrender.com` URL and lets you
  attach a custom domain in the service settings.
