# Deploying the Bliszware API (BliszWare-Server)

The API is a plain Node.js + Express app. It runs anywhere Node 18+ runs —
Railway, Render, Fly.io, a VPS, etc. **Render (free tier) or Railway are the
easiest.**

## 1. Create a MongoDB Atlas database (free)

1. Sign up at https://www.mongodb.com/cloud/atlas → create a free **M0** cluster.
2. Database Access → add a database user (username + strong password).
3. Network Access → allow access from anywhere (`0.0.0.0/0`) or your host's IPs.
4. Copy the connection string (Drivers → Node.js), e.g.
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/bliszware`
   — make sure the database name (`/bliszware`) is in the path.

## 2. Deploy the API

On your host (example: Render → New → Web Service → connect this repo):

- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check path:** `/api/health`

## 3. Environment variables (set these on the host)

| Variable | Required | Value |
| --- | --- | --- |
| `NODE_ENV` | ✅ | `production` |
| `PORT` | host-dependent | Most hosts inject this automatically |
| `MONGO_URI` | ✅ | Your Atlas connection string (step 1) |
| `JWT_SECRET` | ✅ | Long random string: `openssl rand -base64 48` — never reuse the dev one |
| `JWT_EXPIRES_IN` | | `30d` |
| `CLIENT_URL` | ✅ | Your storefront URL, e.g. `https://bliszware.vercel.app` (comma-separate several). Controls CORS — wrong value = frontend can't call the API |
| `SUPERADMIN_NAME` / `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` | ✅ for first seed | Used by `npm run superadmin` to create your admin login. Pick a strong, unique password |
| `ADMIN_EMAIL` | recommended | Where new-order & low-stock alert emails go |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `EMAIL_FROM` | for real emails | Gmail: `smtp.gmail.com` / `587` / your Gmail / an **App Password** (Google Account → Security → 2-Step Verification → App passwords). Without `SMTP_PASS`, emails are logged to the console instead of sent |
| `GOOGLE_CLIENT_ID` | optional | OAuth 2.0 Web client ID from https://console.cloud.google.com → APIs & Services → Credentials. Add your storefront domain to **Authorised JavaScript origins**. Must match the frontend's `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Blank = Google sign-in hidden |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | recommended | From https://cloudinary.com dashboard. Without it, uploaded images/slips are stored on the server's disk — which is **wiped on redeploy** on most hosts, so use Cloudinary in production |
| `PAYHERE_MODE` / `PAYHERE_MERCHANT_ID` / `PAYHERE_MERCHANT_SECRET` / `PAYHERE_NOTIFY_URL` | only if enabling PayHere | `NOTIFY_URL` must be `https://YOUR-API-DOMAIN/api/payments/payhere/notify` |
| `ALLOW_DEMO_PAYMENTS` | | Leave `false` in production |
| `BANK_NAME` / `BANK_ACCOUNT_NAME` / `BANK_ACCOUNT_NO` / `BANK_BRANCH` / `WHATSAPP_NUMBER` | optional | Only pre-fill the store settings the **first** time the API runs. After that, manage them in **Admin → Settings** — no redeploy needed |

## 4. First-run tasks (once, after the first deploy)

```bash
# Creates/promotes the super admin from SUPERADMIN_* env vars,
# without touching products or orders:
npm run superadmin
```

(Render/Railway both have a "Shell" tab to run one-off commands.)

Then sign in at `https://your-storefront/admin/login`, and immediately:
1. Open **Admin → Settings** and enter your real **bank details** and
   **WhatsApp number** (customers see these at checkout & on the contact page).
2. Change anything seeded from env you don't want kept.

## 5. Verify

- `https://YOUR-API-DOMAIN/api/health` → `{"status":"ok"}`
- `https://YOUR-API-DOMAIN/api/settings` → your bank + WhatsApp settings
- Storefront loads products and login works (if not, re-check `CLIENT_URL`).

## Security notes

- `.env` is gitignored — never commit it. Set values on the host instead.
- Rotate `JWT_SECRET` and `SUPERADMIN_PASSWORD` if you ever suspect a leak
  (rotating the JWT secret signs everyone out).
