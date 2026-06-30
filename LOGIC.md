# CloudSync Admin Panel — Logic Reference

**Stack:** Next.js 16 (App Router, Turbopack), TypeScript, Firebase Admin SDK, Nodemailer, Google Play Developer API

---

## Authentication

- Admin login via Firebase Email/Password (`src/lib/firebase.ts` — client SDK).
- Every API route calls `verifyToken(req)` (`src/lib/auth-server.ts`) which validates the Firebase ID token from the `Authorization: Bearer <token>` header.
- Unauthorized requests return `401`.

---

## Data Store — Firestore Collections

| Collection | Description |
|---|---|
| `users/{uid}` | User profile, plan, status, FCM token, upload stats, settings |
| `subscriptions/{id}` | Billing records (plan, status, billingCycle, amount, renewalDate) |
| `notifications/{id}` | Push notification dispatch logs |

---

## API Routes

### Users
| Route | Method | Purpose |
|---|---|---|
| `/api/users` | GET | List all users ordered by `lastLogin` desc |
| `/api/users/[uid]` | GET | Fetch single user |
| `/api/users/[uid]` | PATCH | Update `plan`, `status`, or `fcmToken` (whitelisted fields only) |
| `/api/users/[uid]` | DELETE | Delete user document |
| `/api/users/[uid]/history` | GET | Sync history for a user |

### Subscriptions
| Route | Method | Purpose |
|---|---|---|
| `/api/subscriptions` | GET | List all subscriptions + computed stats (totals, revenue by billing cycle) |
| `/api/subscriptions/[id]` | PATCH/DELETE | Update or remove a subscription record |

### Billing
| Route | Method | Purpose |
|---|---|---|
| `/api/billing/google-play/verify` | POST | Client-triggered purchase verification — calls Google Play API, writes subscription to Firestore |
| `/api/webhooks/google-play` | POST | Server-side RTDN webhook from Google Play Pub/Sub — decodes Base64 payload, calls `syncGooglePlayPurchaseFromNotification` |

### Notifications
| Route | Method | Purpose |
|---|---|---|
| `/api/send-notification` | POST | Send FCM push to a single device token via Firebase Admin Messaging |
| `/api/notifications` | GET | Fetch notification dispatch history |

### Email
| Route | Method | Purpose |
|---|---|---|
| `/api/send-mail` | POST | Send transactional email via Nodemailer/SMTP. Body: `{ to, subject, template (HTML) }` |

---

## Plans (`src/lib/billing.ts`)

| Key | Label | Quota | Price | Billing Kind |
|---|---|---|---|---|
| `free` | Free | 1 GB | ₹0 | none |
| `yearly` | Yearly | Unlimited | ₹10/year | subscription |
| `lifetime` | Lifetime | Unlimited | ₹4999 | one_time |

- `normalizePlanKey()` maps aliases (`pro` → `yearly`) and unknown keys → `free`.
- `resolvePlanFromProductId()` maps Google Play product IDs to plan keys via env vars.

---

## Google Play Billing Flow

1. App purchases via Play Billing (`PlayBillingManager.kt`).
2. On purchase success, app POSTs to `/api/webhooks/google-play` with `purchaseToken` + `productId`.
3. Backend calls Google Play Developer API to verify, then writes/updates `subscriptions/{id}` and `users/{uid}.plan`.
4. Google Play RTDN (Real-Time Developer Notifications) also POSTs to the same webhook via Pub/Sub (Base64-encoded JSON payload).

---

## Email (`src/lib/mail.ts`)

- Nodemailer transporter configured via env: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`.
- Default From: `"CloudSync Admin" <SMTP_USER>`.
- CC `manish@cstech.in` added to all registration/welcome emails.

---

## Frontend Structure

```
src/
  app/
    page.tsx              — root: renders LoginForm or DashboardShell based on auth state
    layout.tsx            — metadata (title, description)
  components/
    DashboardShell.tsx    — sidebar nav, tab routing (Users / Subscriptions / Notifications / Insights)
    LoginForm.tsx         — Firebase email/password sign-in
    users/                — UserDetail, PlanModal, StatusToggle, Badges, ProviderIcons
    subscriptions/        — SubscriptionsTab
    notifications/        — SendNotificationModal, NotificationHistory
    insights/             — InsightsTab (charts, revenue stats)
  lib/
    firebase.ts           — client SDK init
    firebase-admin.ts     — server SDK init (reads service-account.json)
    auth-server.ts        — verifyToken, unauthorized(), serverError()
    billing.ts            — plan configs, normalization, product ID resolution
    constants.ts          — COLORS, PROVIDERS, AdminUser type, formatters
    mail.ts               — Nodemailer transporter
    google-play.ts        — Play Developer API calls
    logger.ts             — structured logger
```

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port (587 default) |
| `SMTP_SECURE` | `true` for port 465 |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password / app password |
| `SMTP_FROM` | Override From address |
| `GOOGLE_PLAY_WEBHOOK_SECRET` | Validates incoming webhook requests |
| `GOOGLE_PLAY_YEARLY_PRODUCT_ID` | Play product ID for yearly plan |
| `GOOGLE_PLAY_LIFETIME_PRODUCT_ID` | Play product ID for lifetime plan |
