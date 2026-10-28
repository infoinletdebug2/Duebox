# Duebox paywall — hard paywall, store free trial

Decided 2026-10-28, modelled on the live Meld apps (dub-meld is the reference).

## The model

- **No free tier, no server trial.** Pitch → sign up → two-tap setup → **paywall** → app.
- **$7.99 / month, $39.99 / year**, one subscription group, entitlement `pro`.
- **Free trial: 3 days on YEARLY only**, the stores' own introductory offer, so the card is taken upfront. The stores decide eligibility and charge when it ends.
- **Lapsed** (trial cancelled, expired, refunded): the app locks to the paywall and reminders stop. Data is kept; Account → Export / Delete stay open (App Review 5.1.1(v)).
- The household is what's subscribed: everything follows the **owner's** subscription; members see an "ask the owner" state.

## How it works

| Where | What |
|---|---|
| `backend/src/billing.ts` | `accessOf()` → entitled + status (`trial` / `active` / `grace` / `billing_retry` / `expired` / `none`) from the store purchase. Store trial is read from the payload; Apple grace keeps access; old server-trial rows unlock nothing; a lapsed-but-active purchase is re-checked with the store before locking. Fails open if billing is down. |
| `backend/src/middleware.ts` | `requireSubscription` on every household data route → 402 `SUBSCRIPTION_REQUIRED`. Open: auth, setup, billing, devices, export, leave, account deletion. |
| `backend/src/milestones.ts` | `trial_started` / `purchase_completed {trial_conversion | subscription}` / `subscription_ended`, once per store chain, from verify, restore and store notifications (Meta StartTrial (0) / Subscribe too). |
| `backend/src/jobs/deliver.ts` | No reminders for a locked household. |
| `mobile/app/_layout.tsx` | Not subscribed → `/paywall` from anywhere but paywall, legal, settings, setup, auth, join. Plan re-read on every foreground. |
| `mobile/app/paywall.tsx` | No close; Restore · Terms · Privacy · Sign out · ⚙ Account. Yearly preselected; "free" only if the store offers it to this store account AND the server says this account never bought. |
| `mobile/src/billing/store.ts` | Prices + trial length from the store; Play buys the trial offer token; Apple `appAccountToken` / Play `obfuscatedAccountId` = account id. |

Live check: `cd backend && npx tsx --env-file=.dev.vars scripts/paywall-check.ts` (21 checks; production by default).
`scripts/api-test.sh` still contains free-tier checks from the soft model and needs updating before it is run again.

## Store setup (by hand — none of this is in code)

### App Store Connect
1. **Subscription group** "Duebox Pro" with two auto-renewable subscriptions:
   - `duebox_pro_yearly` — 1 year — **$39.99**
   - `duebox_pro_monthly` — 1 month — **$7.99**
2. On `duebox_pro_yearly`: **Introductory Offer → Free → 3 days**, all territories, **new subscribers only**. None on monthly.
3. Each subscription needs a display name, description and an **App Review screenshot of the paywall**, and must be **attached to the app version** in the web UI.
4. **App Store Server Notifications V2** → `https://duebox.xenition.com/api/v1/billing/apple/notifications` (production and sandbox).
5. **In-App Purchase key** (Users and Access → Integrations): set `APPLE_KEY_ID`, `APPLE_ISSUER_ID`, `APPLE_PRIVATE_KEY` on the worker.
6. **Paid Apps Agreement** active, or the purchase button silently does nothing (rejection 2.1(b)).
7. The description must include the subscription terms ("payment charged at confirmation of purchase…", "any unused portion of a free trial is forfeited…") and prices that match.

### Google Play Console
1. Subscription `duebox_pro_yearly`, base plan `yearly` (auto-renewing, 1 year, **$39.99**), plus an **offer** `free-trial` on it: **one free phase of 3 days**, eligibility **new customer acquisition — never had this subscription**.
2. Subscription `duebox_pro_monthly`, base plan `monthly` (1 month, **$7.99**), no offers.
3. **Real-time developer notifications**: Pub/Sub topic → push subscription to `https://duebox.xenition.com/api/v1/billing/google/notifications`.
4. A service account with **View financial data** + **Manage orders and subscriptions**: set `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` on the worker.

## SDK improvements (xenition-sdk), Duebox works around them today

1. **Store free trial**: `check().isTrial` is only true for the SDK's own server trial. Expose `isStoreTrial` / `offerType` / `willRenew` on `Purchase` and `EntitlementCheck` (Apple `offerType`/`offerDiscountType`, Play line-item `offerDetails`). Workaround: `isStoreTrial()` in `backend/src/billing.ts`.
2. **Apple grace bug**: status 4 maps to `grace`, but `expires_at` is the lapsed transaction date, so `check()` denies access during grace. Read `gracePeriodExpiresDate` from `signedRenewalInfo`. Workaround: grace keeps access in `accessOf()`.
3. **appAccountToken / obfuscatedAccountId**: resolve the owner of a notification that arrives before `/verify` (today: `unknown_purchase`). The app already sends both.
4. **Google**: follow `linkedPurchaseToken` (plan switch / resubscribe) and handle `voidedPurchaseNotification` (refunds).
5. **Optional**: verify Apple's JWS x5c chain and Pub/Sub's OIDC token (today notifications are only triggers to re-read from the store, which limits the damage).
6. **Sandbox**: the SDK README says sandbox never unlocks production — that must stay **off by default**: App Review buys with sandbox accounts against the production server. Mark sandbox purchases for analytics instead (Duebox sends `sandbox: true` on its events).
