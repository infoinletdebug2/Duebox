# Store readiness

Apple/Google requirements. Most are **rejections**, each costing a ~week-long review cycle.

## Required screens
Sign out · Change password (if password auth) · Notification preferences (per category) · **Delete my account** (mandatory on App Store since June 2022) · Export my data (never paywalled) · Terms + Privacy (reachable from paywall AND settings) · Version + build number · Rate this app.

**Terms and Privacy are native screens, not links:** a 404 link is a rejection; uneasy users shouldn't need a connection; reviewers dislike being sent to a browser. Four-line plain summary on top, detail below. Write them from what the code actually does, not a template, and tell the owner generated legal text is a draft needing a qualified review.

## In-app purchase
- **The device never says what it bought.** It sends a transaction id (iOS) / purchase token (Android); the server asks the store. "Is subscribed" is a server answer, cached at most, re-read on launch and after purchase/restore — never a client-written flag.
- **Play auto-refunds anything unacknowledged within 3 days.** Verifying ≠ acknowledging. Acknowledge after verification; swallow ack failure (purchase is real and recorded; Play retries).
- **Finish the transaction only after the server answers** — finishing first stops iOS redelivery and loses the purchase on failure.
- **Prices come from the store** (StoreKit/Play at runtime), rendered unmodified. Marketing labels ("SAVE 33%") are copy; don't compute them from localised strings.
- Every paywall: **Restore purchases**, Terms and Privacy links, disclosure (auto-renewal, cancel in the store account, what a trial converts to).
- **react-native-iap v16 is event-based:** result arrives on `purchaseUpdatedListener`. Attach listeners before `requestPurchase()` (cached sandbox purchases emit instantly) and add a timeout.
- None of it runs in Expo Go — use a dev build / EAS.

## Sign in with Apple
- Mandatory on iOS if any third-party sign-in is offered.
- `ios.usesAppleSignIn: true` (entitlement) or every authorization fails at runtime.
- Apple sends the name **once**, on the first authorization ever. Capture it then.
- Nonce: send Apple the SHA-256, server compares the raw value.

## Google Sign-In
- Id token is issued against the **web** client id, on iOS too; iOS client alone → token the server can't verify.
- Android needs an Android OAuth client matching package name **and this build's signing SHA-1** (`eas credentials`).
- Client ids are public (`.env`). Client secret is never needed in a mobile app.
- Sign out of Google too, or the next sign-in silently returns the same person.

## Review prompt
- OS dialog with a hidden quota (Apple: ~3/year/person, rest swallowed silently). Treat each ask as consumable.
- Never after sign-up/onboarding, on launch, after an error, or mid-task.
- Ask after ~3 successes plus a few-day floor; once ever; `isAvailableAsync()` first ("unavailable" is normal); fire after the confirmation toast.
- Keep a manual "Rate this app" settings row (no quota). Both store ids must be real before release.

## Play financial declaration
Required even from apps declaring no financial features.
