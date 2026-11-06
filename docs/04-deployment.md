# Deployment Strategy

Status: **APPROVED** (2026-11-06). Hosting is not decided yet; the same build supports both options below. The decision is due before Step 10.

Decision inputs gathered so far (2026-11-06):
- Shop internet: **reliable** during business hours, so a VPS is viable.
- Owner needs remote access (dashboard from home or while travelling): **unknown, ask the client.** If yes, choose the VPS, or the shop PC plus Tailscale.
- Off-machine backup destination: decided together with hosting.
- Printing works through the OS printer driver in both options, so the printer connection (USB, Bluetooth or network) does not affect this choice.

The same code runs everywhere. Only the environment variables differ.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection |
| `AUTH_SECRET` | Auth.js signing secret (random 32+ bytes) |
| `AUTH_URL` | Public base URL (`http://192.168.1.50:3000` or `https://rent.example.in`) |
| `AUTH_TRUST_HOST` | `true` behind a proxy / on a LAN |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | First admin (used once) |
| `APP_TIMEZONE` | `Asia/Kolkata` |
| `BACKUP_DIR` | Where nightly dumps go |

Release steps (both environments): `npm ci` → `npx prisma migrate deploy` → `npm run build` → restart the service. Before any migration, a backup is taken automatically by the update script.

---

## Option A – Shop PC on the local network (Windows 10/11)

| Component | Setup |
|---|---|
| PostgreSQL 18 | Official Windows installer, running as a Windows service. Listens on `localhost` only. |
| Node.js LTS | Official installer |
| Playwright Chromium | `npx playwright install chromium` (for PDFs) |
| App | `next build` (standalone) run as a **Windows service via NSSM**, so it starts automatically at boot |
| Network | Fixed IP for the PC (DHCP reservation on the router) and a Windows Firewall rule for port 3000 on the *Private* profile only. Phones and PCs on the shop Wi-Fi open `http://<pc-ip>:3000`. |
| Backups | Task Scheduler runs `scripts/backup.ps1` nightly (`pg_dump -Fc`, 30 daily + 12 monthly kept), plus a copy to a synced Google Drive folder or a USB drive |
| Power | A UPS is strongly recommended, because sudden power loss is the main data risk on a shop PC. Windows auto-updates should be set to not restart during business hours. |

Trade-offs:
- There is no monthly cost, and it works without internet.
- It is reachable only inside the shop network.
- Traffic is plain HTTP on the LAN. That is acceptable on a private Wi-Fi with a strong password, and the README will say so. Remote access later can be added via Tailscale with no code change.

## Option B – Linux VPS (Ubuntu 24.04 LTS, 2 GB RAM)

| Component | Setup |
|---|---|
| PostgreSQL 18 | PGDG apt repo. Listens on `localhost` only, with a dedicated DB user. |
| Node.js LTS | NodeSource or nvm. Runs as an unprivileged `rms` user. |
| Playwright Chromium | `npx playwright install --with-deps chromium` |
| App | **systemd** service (`rms.service`), auto-restart |
| Reverse proxy / HTTPS | **Caddy**, which obtains and renews the TLS certificate automatically |
| Firewall | `ufw`: allow 22, 80 and 443 only. SSH by key, password login disabled. Fail2ban. |
| Backups | cron runs `scripts/backup.sh` nightly (`pg_dump -Fc`, rotation), with an off-site copy via rclone (Google Drive / Backblaze B2) |
| Updates | `unattended-upgrades` for security patches |

Trade-offs:
- It is accessible from anywhere, uses HTTPS, and needs no hardware in the shop.
- It costs roughly ₹500–1,500 per month and needs internet at the shop.

## Moving between options

Run `pg_dump` on the old machine and `pg_restore` on the new one, then point `DATABASE_URL` at it. No code changes are needed.

## Monitoring

- `/api/health` checks the DB connection and returns 200.
- On the VPS, a free uptime monitor (e.g. UptimeRobot) can watch it.
- The backup script logs its result, and the admin settings page shows "Last backup: <date>" (read from the backup log).
