# Duebox — Life-Admin Deadline Keeper
## MVP Software Requirements Specification

**Document Version:** 1.0 (2026-10-04)
**Working name:** Duebox (placeholder — trademark and store-name check pending, §19)
**Product Type:** Mobile consumer subscription (productivity)
**Platforms:** iOS and Android (web build only for the screenshot harness)
**Primary Users:** Adults who run a household's paperwork — renewals, bills, forms, warranties, trials
**Market:** United States first; UK, Canada, Australia from v1 (English, any currency)
**Business Model:** Freemium — free tier forever, Pro monthly or yearly (in-app purchase, 7-day intro trial on yearly)
**Mobile:** Expo (React Native) + Expo Router + React Query — **no Xenition package on the phone**
**Backend:** Hono + TypeScript on Cloudflare Workers, `@xenition/sdk` (Postgres, auth, private storage, store billing)
**Document reading:** a vision model through OpenRouter, called **only from the worker**
**Reminders:** Worker cron → Expo Push Service, called **only from the worker**
**Money:** integer cents everywhere

Companion documents: `DESIGN-SYSTEM.md`, `SCREENS.md`, `CONTRACT.md`,
`ARCHITECTURE.md`. Code cites this document by id (`FR-S3`, `BR-07`);
ids are never reused or renumbered.

---

# 1. Product Summary

Duebox turns any letter, bill, renewal notice, form or screenshot into a
tracked deadline. You photograph it, the AI reads it, you confirm one card,
and Duebox reminds you **before** the deadline — 30, 7 and 1 days ahead —
not on the day.

```
snap  →  AI reads  →  confirm the card  →  reminded ahead  →  done (next one scheduled if it repeats)
```

**The one sentence on the home screen:** "Car insurance renews in 6 days."

**The one promise:** nothing with a date slips through.

---

# 2. Problem

- Life admin arrives as paper and PDFs: renewal notices, council and tax
  letters, school forms, insurance, warranties, permits, free-trial emails.
- The deadline is buried in the second paragraph. People either act at once
  (rare), leave the letter on the counter (common), or type a calendar entry
  that has no amount, no reference number and no copy of the letter.
- Missing one costs real money: late fees, lapsed cover, auto-renewals that
  could have been cancelled, an expired passport a week before a trip.
- Calendars and to-do apps can hold the date but cannot read the letter, and
  do not remind ahead in a sensible pattern. Nobody wants a spreadsheet.

---

# 3. Market (researched 2026-10-04)

| App | What it does | Price | Gap Duebox fills |
|---|---|---|---|
| [Life Admin (Navoks)](https://navoks.com/) | Scan invoice/PDF, AI extracts company, amount, due date; email reminders 30/14/7/1 days | Not published | Email only, invoice-shaped; no household, no repeat handling |
| [Expiro](https://apps.apple.com/app/id6758278098) | On-device scan of IDs (MRZ/barcode), household calendar, fine warnings | Free 1 person/3 docs; Pro $9.99/yr, $24.99 lifetime | ID documents only, Gulf expat niche, iOS only |
| [Paperwork](https://apps.apple.com/app/id6751298589) | Scan mail into smart folders, highlights what needs action, reminders | $3.99/mo, $34.99/yr | iPhone only, on-device only — no partner sharing, no Android |
| [Renewly](https://play.google.com/store/apps/details?id=com.dev.renewly) | Manual expiry tracker for documents, warranties, insurance | Free/offline | Manual typing; no reading; no sync |
| [Check My Warranty](https://www.checkmywarranty.app/) | Warranties + documents + reminders | Freemium | Warranty-centred |
| [Quicken LifeHub](https://www.quicken.com/blog/best-apps-for-tracking-renewals-due-dates-and-subscriptions-2026/) | Document vault (30 GB), renewal reminders, family roles | $1.99–3.99/mo | A vault first; heavy; tied to Quicken |
| RemindMe / DocsAlert | Passport/ID expiry reminders | Freemium | IDs only, manual |

**What the market proves:** people already pay **$34.99/yr** for this job
(Paperwork), and every competitor is one of: on-device and single-person,
manual entry, or one category (IDs, warranties, invoices).

**Duebox's position:** reads **any** document type with AI, **syncs a
household** across iOS and Android, handles **repeats** (renew yearly → next
year scheduled on Done), and says **what to do**, not just the date.

---

# 4. Goals and Metrics

| Id | Goal | Measure |
|---|---|---|
| G1 | Time to first value | Install → first confirmed item < 90 s (median) |
| G2 | Reading quality | ≥ 90% of scanned items saved with the AI date unchanged |
| G3 | Activation | ≥ 50% of sign-ups save 3 items in 7 days |
| G4 | Retention | ≥ 30% mark an item done in week 4 |
| G5 | Conversion | ≥ 4% of activated users on Pro by day 30 |

---

# 5. Users and Roles

| Role | Can |
|---|---|
| **Owner** | Everything, incl. household settings, invites, subscription, deleting the household |
| **Member** (Pro only) | Add, edit, complete, snooze and delete items; scan; attach files |

One household per user. A household is created automatically at sign-up
("Your home"). Pro is per household: the owner pays, members inherit.

---

# 6. Scope

**In v1**
- Email + password, Sign in with Apple, Google sign-in; email verification code
- Scan (camera, up to 5 pages), photo library, PDF → AI reads → confirm 1–3 items
- Manual add
- Items: title, category, action, due date, amount, issuer, reference (last 4), notes, repeat, reminders, assignee, attachments
- Reminders by push: before-offsets, due-day, one overdue nudge; snooze; Done from the notification
- Home: Next up, Overdue, This week, This month, Later
- All items: search, filter by category/status, Done archive
- Household sharing (Pro): invite by code/link, assignee
- Repeating items: on Done, the next occurrence is created
- Free/Pro gating, paywall, restore, store-verified purchases
- Export (CSV + JSON) and account deletion — free for everyone
- Native Terms and Privacy screens; notification preferences; rate-this-app

**Not in v1 (written down so it is not built by accident)**
- Email forwarding inbox (needs an inbound mail route) — v1.1
- Share-sheet import from other apps (needs a native extension) — v1.1
- Calendar feed (`.ics`) and calendar sync — v1.1
- Month calendar view — v1.1
- Bank connection, bill payment, subscription auto-detection — never in v1
- Web app, desktop app, widgets, Apple Watch
- Custom categories, tags, folders
- Multiple households per user
- Email or SMS reminders (push only)

---

# 7. Functional Requirements

## 7.1 Accounts and household — FR-A

- **FR-A1** Sign up / sign in with email + password, Apple (iOS required when Google is offered), or Google. Email accounts verify with a 6-digit code.
- **FR-A2** First sign-in creates the household automatically: name "Your home", timezone from the device, currency from the device region, reminder hour 09:00.
- **FR-A3** Owner (Pro) invites up to 4 members by share link or 6-character code; invites expire in 7 days.
- **FR-A4** A member can leave; the owner can remove a member. Items stay with the household.
- **FR-A5** Delete account: owner deletion deletes the household, every row and every stored file; member deletion removes only their membership and devices. Confirm by typing `DELETE` (or password).
- **FR-A6** Export: CSV of items and a JSON of everything, generated server-side, shared through the OS share sheet. Never paywalled.

## 7.2 Scanning and reading — FR-S

- **FR-S1** Scan from the camera (multi-page, up to 5), photo library (up to 5 images), or one PDF (≤ 10 pages, ≤ 15 MB).
- **FR-S2** Images are resized on the device to ≤ 1600 px long edge, JPEG quality 0.7, before upload. Upload goes direct to private storage via presigned URLs.
- **FR-S3** The worker sends the pages to the vision model and gets back **0–3 candidate items**, each with: title, category, action, due date, the **evidence** (the exact words the date came from), amount, currency, issuer, reference, repeat hint, notes, and a confidence per field.
- **FR-S4** Reading shows the page thumbnails and honest progress ("about 10 seconds"); the user may leave — the scan stays in Inbox until confirmed.
- **FR-S5** Confirm screen: one card per candidate; the due date is the largest element with its evidence under it; low-confidence fields are marked "Check this"; every field editable; the user can drop a candidate. **Save** creates the items and attaches the document to them.
- **FR-S6** Read failure (blurry, no date found, not a document) → "We couldn't find a date in this one" → Retake · Type it in (manual form, photo still attached).
- **FR-S7** Monthly scan allowance per household: Free 3, Pro 100 (fair use). The count is the number of `read` calls that returned.

## 7.3 Items — FR-I

- **FR-I1** Create manually: only **title** and **due date** are required; everything else is optional and collapsed under "More details".
- **FR-I2** Category (fixed set): ID & travel · Vehicle · Home · Insurance · Bills & money · Health · Kids & school · Subscriptions & trials · Work · Other. Each has an icon; the AI chooses one.
- **FR-I3** Action (fixed set): Renew · Pay · Submit · Cancel · Book · Attend · Other. Shown as the verb on the row ("Renew by 14 Mar").
- **FR-I4** Repeat: None · Monthly · Every 3 months · Every 6 months · Yearly · Every N years (2–10, for passports and licences).
- **FR-I5** Status: `open` → `done` (with done date and who). Done items move to the Done archive; **Reopen** restores them.
- **FR-I6** Marking a repeating item done creates the next occurrence (same title, category, action, amount, issuer, reference, repeat, assignee; due date advanced by the interval from the **old due date**; no attachments) and says so: "Done. Next renewal: 14 Mar 2028."
- **FR-I7** Snooze (from the item or the notification): 1 day · 3 days · 1 week. Snooze adds a one-off reminder; it never moves the due date.
- **FR-I8** Attachments: add photos/PDF to any item; view full screen; delete.
- **FR-I9** Delete an item: confirm sheet naming the item and saying attachments are deleted too.
- **FR-I10** Search by title, issuer and notes; filter by category and by Open / Done.

## 7.4 Reminders — FR-R

- **FR-R1** Each item has a reminder schedule = a set of day offsets before the due date. Defaults: Free `[7]`; Pro `[30, 7, 1]`. Plus a **due-day** reminder (both tiers) and **one overdue nudge** the day after (both tiers).
- **FR-R2** Pro can pick offsets per item from: 60, 30, 14, 7, 3, 1 days before.
- **FR-R3** Reminders fire at the household's reminder hour (default 09:00) in the household timezone.
- **FR-R4** Offsets already in the past at creation are skipped; if every offset is past, the next reminder is the due-day one (or a reminder 1 hour from now if due today and the hour has passed).
- **FR-R5** Who is notified: the assignee if set, else every member with notifications on.
- **FR-R6** Notification text: "{Action} {title} — {in N days | today | was due yesterday}" + amount if any. Tap opens the item. Actions: **Done** and **Snooze 1 day** (dev build only; Expo Go shows the plain notification).
- **FR-R7** Changing due date, offsets, status, hour or timezone recomputes the unsent reminders.
- **FR-R8** Notification permission is asked **after the first item is saved**, on an explain-first screen: "Turn on reminders so we can tell you 7 days before {title}." Denied → a banner on Home with "Turn on in Settings".
- **FR-R9** Preferences per user: Deadline reminders on/off; Overdue nudges on/off.

## 7.5 Home — FR-H

- **FR-H1** **Next up** card: the nearest open item — title, action verb, countdown ("in 6 days" / "today" / "2 days late"), amount, one tap to open, **Mark done** inline.
- **FR-H2** Sections: Overdue (only if any) · This week · This month · Later (collapsed count, opens All items).
- **FR-H3** Persistent **Scan** button in the thumb zone; long-press or a secondary button for "Add manually".
- **FR-H4** Inbox strip when scans are unconfirmed: "2 scans waiting for you to check".
- **FR-H5** Empty home: one drawing, "Snap a letter with a deadline. We'll read it and remind you before it's due." → **Scan your first letter** + "Type one instead".

## 7.6 Household sharing — FR-M (Pro)

- **FR-M1** Members see and edit all items. Each item may have an assignee.
- **FR-M2** Item rows show the assignee's initial when the household has more than one member.
- **FR-M3** If Pro lapses, members keep read access and can mark items done; only the owner can add items, within the free limit.

## 7.7 Subscription — FR-B

- **FR-B1** Free forever: 5 open items, 3 scans/month, default reminders only, one person.
- **FR-B2** Pro: unlimited open items, 100 scans/month, custom reminder offsets, household of up to 5, unlimited attachments.
- **FR-B3** Products: `duebox_pro_monthly` and `duebox_pro_yearly` (7-day free trial as a store introductory offer on yearly). Server-verified; one entitlement `pro` for the household.
- **FR-B4** Paywall opens only at a limit, never during onboarding: the 6th open item, the 4th scan in a month, Invite, or custom reminders. Headline names the outcome ("Track everything with a deadline").
- **FR-B5** Paywall shows store prices only, **Restore purchases**, Terms, Privacy, auto-renew and trial disclosure.
- **FR-B6** Lapse never deletes or hides anything (BR-07).

## 7.8 Settings — FR-X

Account (name, email, change password), Notifications (FR-R9), Reminder time, Household & members, Subscription, Export, Delete account, Privacy, Terms, Rate Duebox, Support email, Version + build.

---

# 8. Business Rules

| Id | Rule |
|---|---|
| **BR-01** | The household is the privacy boundary; the server derives `household_id` from the caller's membership, never from the request. |
| **BR-02** | AI output is a **draft**. Nothing becomes an item or a reminder until the user confirms. |
| **BR-03** | The AI never invents a date. No date with evidence → `dueDate: null` and the user must pick one. The evidence string is stored with the draft. |
| **BR-04** | Due dates are calendar dates (`YYYY-MM-DD`) in the household timezone; reminders are instants computed from date + offset + reminder hour + timezone. |
| **BR-05** | Money is integer cents in the household currency; amounts are optional and never negative. |
| **BR-06** | Free limit counts **open** items only; done items never count. |
| **BR-07** | A lapsed household keeps every item, reminder, attachment, export and deletion. Only creating items over the limit, scanning over the allowance, invites and custom offsets are gated. |
| **BR-08** | Reference numbers (policy, account, passport, licence, member ids) are masked to the last 4 at extraction; the full string is never stored. |
| **BR-09** | Files are private: served only by 15-minute signed URLs to household members. |
| **BR-10** | The worker calls the AI with data collection denied; no document content is logged — only model, page count, duration and error class. |
| **BR-11** | A repeating item's next due date is computed from the previous **due date**, not the date it was marked done; month-end dates clamp (31 Jan + 1 month = 28/29 Feb). |
| **BR-12** | Billing lookups on core paths fail **open to free**, logged; billing never blocks reading existing data or marking done. |

---

# 9. Data Model (summary)

Full DDL: `CONTRACT.md` §4. Tables (prefix `dx__`):
`profile` · `household` · `member` · `invite` · `item` · `reminder` ·
`document` · `page` · `device` · `usage`.

---

# 10. Non-functional Requirements

| Area | Requirement |
|---|---|
| Performance | Home < 600 ms warm; reading p95 < 20 s for 3 pages |
| Reminders | Delivered within 10 minutes of their time (cron every 5 min) |
| Privacy | No ads, no third-party analytics, no data sale; AI used only for reading; delete/export in-app; App Store label: contact info, user content — not used for tracking |
| Security | Tokens in Keychain/Keystore (expo-secure-store); presigned uploads; signed downloads (15 min); rate limits: auth 10/min, read 20/hour per user |
| Reliability | A failed read leaves the scan in Inbox with a manual path; never lose an upload; a failed push is retried on the next cron run up to 3 times |
| Accessibility | Dynamic Type to 200%; countdowns read as words ("due in six days"); contrast ≥ 4.5:1; state never by colour alone |
| Offline | Home and items cached (React Query persisted); Done/snooze queue and replay when online |

---

# 11. Compliance Notes

- Not a financial or health app; Play's Financial Features declaration is still required ("none").
- GDPR/UK GDPR for UK users: export + deletion in-app, lawful basis = contract; AI processor named in the privacy policy.
- App Store: Sign in with Apple required (Google is offered); account deletion in-app; Terms/Privacy native.
- Generated legal text is a **draft** and needs a qualified review before submission.

---

# 12. Pricing

| Product id | Price (US) | Notes |
|---|---|---|
| `duebox_pro_monthly` | $4.99 / month | |
| `duebox_pro_yearly` | $34.99 / year | Default; 7-day free trial (store intro offer); "save 41%" label is copy |

Prices on screen always come from the store at runtime.

---

# 13. Analytics (first-party counts only, no content)

`signup` · `item_created {source}` · `scan_read {pages, candidates, ms}` ·
`scan_confirmed {edited_date: bool}` · `item_done {repeat}` · `reminder_sent` ·
`paywall_viewed {reason}` · `purchase_verified`. Never titles, issuers or amounts.

---

# 14. Milestones

| M | Contents | Exit |
|---|---|---|
| M0 | These docs | Frozen |
| M1 | Backend: schema, auth, household, items, reminders planner, scan + read + confirm, devices, cron push, billing | Unit tests (planner, repeat math, gating, extraction coercion); smoke on the real gateway; reader check on 20 sample letters |
| M2 | Mobile shell: tokens, kit, navigation, auth, home, item detail, manual add | Harness screenshots light + dark |
| M3 | Scan → read → confirm, attachments, notifications + permission flow | Real push received on a dev build |
| M4 | Household, paywall, export, deletion, settings, legal, review prompt | Sandbox purchase + restore |
| M5 | TestFlight / internal testing with 15 people's real letters | G1 and G2 measured |

## 14.1 Acceptance tests

1. Photograph a car-insurance renewal → 1 candidate: "Car insurance", Insurance, Renew, due 14 Mar, $412.00, evidence shown → Save → Home Next up shows it.
2. A letter with two deadlines (form by 1 Nov, payment by 15 Nov) → 2 candidates → drop one → 1 item saved.
3. A photo with no date → "We couldn't find a date" → Type it in → photo attached.
4. Item due in 10 days on Pro → reminders at 7 and 1 days, due day, overdue nudge; on Free → 7 days, due day, overdue.
5. Change due date → old unsent reminders gone, new ones planned.
6. Yearly item → Done → next item due one year after the old due date; 31 Jan monthly → 28/29 Feb.
7. Snooze 1 day from a notification → a reminder tomorrow at the reminder hour; due date unchanged.
8. Free user with 5 open items → 6th opens the paywall; marking one done frees a slot.
9. 4th scan in a month on Free → paywall; reading an existing scan still works.
10. Owner invites partner → partner joins → partner's device gets the reminder for an item assigned to them.
11. Pro lapses → all items visible, Done works, export works, Add over limit → paywall.
12. Delete owner account → rows, files and devices gone; a reminder due later is never sent.

---

# 15. Risks

| Risk | Mitigation |
|---|---|
| AI reads the wrong date | Mandatory confirm (BR-02); evidence shown under the date; "Check this" on low confidence; G2 measured |
| Push not delivered (permission off, token expired) | Explain-first permission; Home banner when off; DeviceNotRegistered disables the token; in-app Overdue section never depends on push |
| Timezone/DST mistakes | Planner is a pure, tested function; reminders stored as UTC instants recomputed on any change |
| AI cost per scan | Resize on device; 3/100 monthly allowances; cheap fast vision model by default |
| Crowded "reminder app" perception | Store listing leads with "snap the letter" and the household; screenshots show evidence under the date |

---

# 16–18. Reserved

# 19. Open Questions

1. Final name and store availability (Duebox is a placeholder).
2. Which vision model has the best date accuracy per dollar on real letters (benchmark 20–30 redacted samples, as Clearbill did).
3. Lifetime purchase option (Expiro sells one) — decide after 30 days of data.
4. Email-forward inbox in v1.1 — needs an inbound mail route on the worker.
