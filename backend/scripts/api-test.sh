#!/usr/bin/env bash
# Duebox API test — every route, with curl, against a running worker.
#
#   npm run dev                  # with .dev.vars holding a real Xenition key
#   bash scripts/api-test.sh     # or: API=https://… bash scripts/api-test.sh
#
# Creates two throwaway accounts (an owner and a partner), exercises auth,
# setup + trial, items, repeats, snooze, gating, household sharing, scans
# (the AI reads scripts/sample-letter.jpg — a made-up renewal notice — or
# SAMPLE_LETTER), devices, export,
# the reminder job, and deletes both accounts at the end — also on failure.
# Needs curl and node (node parses the JSON).

set -uo pipefail

API="${API:-http://localhost:8787}/api/v1"
ROOT="${API%/api/v1}"
PASSWORD="api-test-Password-1"
STAMP="$(date +%s)"
OWNER_EMAIL="apitest+owner${STAMP}@duebox.test"
PARTNER_EMAIL="apitest+partner${STAMP}@duebox.test"
TZ_HEADER="America/Chicago"
SAMPLE_LETTER="${SAMPLE_LETTER:-$(dirname "$0")/sample-letter.jpg}"
OUT="$(mktemp)"
PASS=0
FAIL=0
TOKEN=""
OWNER_TOKEN=""
PARTNER_TOKEN=""
FREE_TOKEN=""

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

# js '<expression over d>' — read the last response body as `d`.
js() { node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const v=($1);process.stdout.write(v===undefined||v===null?'':typeof v==='object'?JSON.stringify(v):String(v))" "$OUT"; }

# call METHOD PATH EXPECTED_STATUS [JSON_BODY] [extra curl args…]
call() {
  local method="$1" path="$2" expect="$3" body="${4:-}"
  shift 4 2>/dev/null || shift $#
  local args=(-s -o "$OUT" -w '%{http_code}' -X "$method" "$API$path" -H 'content-type: application/json' -H "x-timezone: $TZ_HEADER" -H 'x-region: US')
  [ -n "$TOKEN" ] && args+=(-H "authorization: Bearer $TOKEN")
  [ -n "$body" ] && args+=(--data "$body")
  local status
  status="$(curl "${args[@]}" "$@")"
  if [[ ",$expect," == *",$status,"* ]]; then
    PASS=$((PASS + 1))
    printf '  \033[32m✓\033[0m %-6s %-48s %s\n' "$method" "$path" "$status"
  else
    FAIL=$((FAIL + 1))
    printf '  \033[31m✗\033[0m %-6s %-48s %s (expected %s)\n' "$method" "$path" "$status" "$expect"
    head -c 600 "$OUT"; echo
  fi
}

# check '<js boolean over d>' 'what it proves'
check() {
  if [ "$(js "$1")" = "true" ]; then
    PASS=$((PASS + 1)); printf '    \033[32m✓\033[0m %s\n' "$2"
  else
    FAIL=$((FAIL + 1)); printf '    \033[31m✗\033[0m %s\n' "$2"; head -c 600 "$OUT"; echo
  fi
}

cleanup() {
  for t in "$FREE_TOKEN" "$PARTNER_TOKEN" "$OWNER_TOKEN"; do
    [ -n "$t" ] && curl -s -o /dev/null -X DELETE "$API/auth/me" -H 'content-type: application/json' -H "authorization: Bearer $t" --data "{\"password\":\"$PASSWORD\"}"
  done
  rm -f "$OUT"
}
trap cleanup EXIT

# A calendar day N days from today IN THE HOUSEHOLD'S ZONE (the server counts days there).
day() { OFFSET="$1" node -e "const t=new Intl.DateTimeFormat('en-CA',{timeZone:'$TZ_HEADER'}).format(new Date());const d=new Date(t+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+Number(process.env.OFFSET));console.log(d.toISOString().slice(0,10))"; }

echo "Duebox API test → $API"
echo
echo "health"
curl -s -o "$OUT" "$ROOT/health"; check 'd.ok===true && d.app==="duebox"' 'GET /health answers'

echo "auth"
call GET /auth/social/providers 200
check 'Array.isArray(d.data)' 'social providers list'
call POST /auth/register 400 '{"email":"not-an-email","password":"x"}'
check 'd.success===false && d.error.code==="VALIDATION_ERROR"' 'bad email → VALIDATION_ERROR envelope'
call POST /auth/register 201 "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}"
check 'd.data.needsSetup===true && d.data.needsVerification===true && d.data.user.name===null' 'register: no name asked, setup + verify pending'
call POST /auth/login 401 "{\"email\":\"$OWNER_EMAIL\",\"password\":\"wrong-password\"}"
check 'd.error.code==="AUTH_INVALID_CREDENTIALS"' 'wrong password → 401 AUTH_INVALID_CREDENTIALS'
call POST /auth/login 200 "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}"
OWNER_TOKEN="$(js 'd.data.accessToken')"; REFRESH="$(js 'd.data.refreshToken')"; TOKEN="$OWNER_TOKEN"
call POST /auth/refresh 200 "{\"refreshToken\":\"$REFRESH\"}"
OWNER_TOKEN="$(js 'd.data.accessToken')"; TOKEN="$OWNER_TOKEN"
check 'd.data.accessToken.length>20' 'refresh rotates the session'
call POST /auth/verify-code 400 '{"code":"000000"}'
check 'd.error.code==="AUTH_INVALID_CODE"' 'wrong verify code → 400, not a sign-out'
call GET /home 409
check 'd.error.code==="HOUSEHOLD_REQUIRED"' 'no household before the first /auth/me'
call GET /auth/me 200
check 'd.data.role==="owner" && d.data.household.timezone==="America/Chicago" && d.data.household.currency==="USD"' 'first /auth/me makes a household from x-timezone / x-region'
check 'd.data.needsSetup===true && d.data.offerSeen===false && d.data.plan.tier==="free" && d.data.plan.trialUsed===false' 'setup pending, offer unseen, Free, no trial yet'
check 'd.data.user.name===null && /home$/.test(d.data.household.name)' 'household named from the email, not the raw local part'
call GET /auth/me 200
check 'd.data.needsSetup===true' 'a second /auth/me does not make a second household'
call POST /auth/change-password 400 '{"currentPassword":"wrong-password","newPassword":"another-Password-2"}'
check 'd.error.code==="INVALID_PASSWORD"' 'change-password with a wrong current one → 400'

echo "setup + 7-day trial"
call POST /setup 400 '{"remindHour":30}'
call POST /setup 200 '{"focus":["vehicle","insurance","nonsense"],"remindHour":8}'
check 'd.data.needsSetup===false && d.data.household.remindHour===8' 'setup saved: reminder hour'
check 'JSON.stringify(d.data.household.focus)==="[\"vehicle\",\"insurance\"]"' 'focus kept, unknown category dropped'
check 'd.data.trialStarted===true && d.data.plan.tier==="pro" && d.data.plan.isTrial===true && d.data.plan.source==="trial" && d.data.plan.trialDays===7' '7-day Pro trial started'
check 'd.data.plan.limits.openItems===null && d.data.plan.trialEndsAt!==null' 'trial = Pro limits, with an end date'
call POST /setup 200 '{"focus":[]}'
check 'd.data.trialStarted===false && d.data.plan.isTrial===true' 'setup again does not restart the trial'
call POST /billing/trial 200
check 'd.data.isTrial===true' 'trial retry is harmless while the trial runs'
call PATCH /auth/me 200 '{"offerSeen":true,"prefs":{"overdue":false}}'
check 'd.data.offerSeen===true && d.data.prefs.overdue===false && d.data.prefs.reminders===true' 'welcome offer marked seen; prefs saved'
call PATCH /auth/me/attribution 200 '{"fbAnonId":"XZ-test-anon","attStatus":"denied","installPlatform":"ios","appVersion":"1.0.0","osVersion":"18.1","deviceModel":"iPhone15,2","locale":"en_US"}'
call PATCH /household 200 '{"name":"The Testers","currency":"EUR"}'
check 'd.data.household.name==="The Testers" && d.data.household.currency==="EUR"' 'household renamed, currency changed'
call PATCH /household 400 '{"currency":"XYZ"}'
call PATCH /household 200 '{"currency":"USD","remindHour":9}'

echo "billing"
call GET /billing/plan 200
check 'd.data.tier==="pro" && d.data.usage.openItems===0 && d.data.usage.month.length===7' 'plan with live usage'
call GET '/billing/products?platform=apple' 200
check 'd.data.products.length===4 && d.data.products.filter(p=>p.offer).length===2 && d.data.trialDays===7' 'catalog: 2 plans + 2 welcome-offer products'
call GET '/billing/products?platform=windows' 400
call POST /billing/verify 503 '{"platform":"apple","transactionId":"2000000123"}'
check 'd.error.code==="STORE_UNCONFIGURED"' 'store keys absent → 503 STORE_UNCONFIGURED, not a crash'

echo "items"
D3="$(day 3)"; D20="$(day 20)"; D40="$(day 40)"; DLATE="$(day -2)"; DTODAY="$(day 0)"
call POST /items 400 '{"title":"","dueDate":"2026-02-30"}'
check 'd.error.fields && d.error.code==="VALIDATION_ERROR"' 'invalid item → field error'
call POST /items 201 "{\"title\":\"Car insurance renewal\",\"dueDate\":\"$D20\",\"category\":\"insurance\",\"action\":\"renew\",\"amountCents\":41250,\"issuer\":\"State Farm\",\"referenceLast4\":\"POL-1234-5678\",\"repeat\":\"yearly\",\"offsets\":[30,7,1]}"
ITEM1="$(js 'd.data.id')"
check 'd.data.referenceLast4==="5678" && d.data.offsets.join()==="30,7,1" && d.data.daysLeft>=19 && d.data.nextReminderAt!==null' 'created: reference masked, Pro offsets, next reminder planned'
call POST /items 201 "{\"title\":\"Pay water bill\",\"dueDate\":\"$D3\",\"category\":\"bills\",\"action\":\"pay\",\"amountCents\":6420,\"repeat\":\"monthly\"}"
ITEM2="$(js 'd.data.id')"
check 'd.data.offsets.join()==="30,7,1"' 'Pro default offsets when none sent'
call POST /items 201 "{\"title\":\"Library books\",\"dueDate\":\"$DLATE\",\"category\":\"other\",\"action\":\"other\"}"
ITEM3="$(js 'd.data.id')"
call POST /items 201 "{\"title\":\"Passport renewal\",\"dueDate\":\"$D40\",\"category\":\"id_travel\",\"action\":\"renew\"}"
ITEM4="$(js 'd.data.id')"
call POST /items 201 "{\"title\":\"School form\",\"dueDate\":\"$DTODAY\",\"category\":\"kids_school\",\"action\":\"submit\"}"
call GET /home 200
check 'd.data.overdue.length===1 && d.data.overdue[0].title==="Library books"' 'Home: overdue'
check 'd.data.thisWeek.length===2 && d.data.thisMonth.length===1 && d.data.laterCount===1' 'Home: this week / this month / later'
check 'd.data.nextUp && d.data.nextUp.daysLeft>=0 && d.data.members.length===1 && d.data.plan.usage.openItems===5' 'Home: next up, members, usage'
call GET '/items?status=open' 200
check 'd.data.items.length===5 && d.data.items[0].title==="Library books" && d.data.nextCursor===null' 'list: due date ascending'
call GET '/items?q=insur' 200
check 'd.data.items.length===1 && d.data.items[0].id==="'"$ITEM1"'"' 'search by title'
call GET '/items?category=bills' 200
check 'd.data.items.length===1' 'filter by category'
call GET "/items/$ITEM1" 200
check 'd.data.seriesCount===1 && Array.isArray(d.data.attachments)' 'item detail'
call GET /items/00000000-0000-0000-0000-000000000000 404
call GET /items/not-a-uuid 404
call PATCH "/items/$ITEM1" 200 "{\"dueDate\":\"$D40\",\"notes\":\"Compare quotes first\"}"
check 'd.data.daysLeft>=39 && d.data.notes==="Compare quotes first"' 'edit re-plans'
call PATCH "/items/$ITEM1" 400 '{"offsets":[5]}'
call POST "/items/$ITEM2/snooze" 400 '{"days":2}'
call POST "/items/$ITEM2/snooze" 200 '{"days":1}' -H 'idempotency-key: snooze-abc'
call POST "/items/$ITEM2/snooze" 200 '{"days":1}' -H 'idempotency-key: snooze-abc'
check 'd.data.id==="'"$ITEM2"'"' 'snooze replay answers the same'
call POST "/items/$ITEM2/done" 200 '' -H 'idempotency-key: done-xyz'
NEXT2="$(js 'd.data.next && d.data.next.id')"
check 'd.data.item.status==="done" && d.data.next && d.data.next.status==="open" && d.data.next.dueDate>"'"$D3"'"' 'monthly item done → next month made'
call POST "/items/$ITEM2/done" 200 '' -H 'idempotency-key: done-xyz'
check 'd.data.next && d.data.next.id==="'"$NEXT2"'"' 'Done replayed (notification retry) → same answer, no second repeat'
call POST "/items/$ITEM2/reopen" 200
check 'd.data.status==="open"' 'reopen'
call POST "/items/$ITEM2/done" 200
check 'd.data.next===null' 'done again does not make a second next occurrence'
call GET "/items/$NEXT2" 200
check 'd.data.seriesCount===2' 'the series counts both'
call GET '/items?status=done' 200
check 'd.data.items.length===1 && Boolean(d.data.items[0].doneAt)' 'done list'
call DELETE "/items/$ITEM3" 200
call GET "/items/$ITEM3" 404

echo "attachments"
call POST "/items/$ITEM4/attachments" 400 '{"pages":[{"mime":"image/png","bytes":10}]}'
call POST "/items/$ITEM4/attachments" 201 '{"pages":[{"mime":"image/jpeg","bytes":1024}]}'
DOC="$(js 'd.data.documentId')"; UPLOAD="$(js 'd.data.uploads[0].uploadUrl')"; HDRS="$(js 'Object.entries(d.data.uploads[0].headers).map(([k,v])=>k+": "+v).join("\n")')"
check 'd.data.uploads.length===1 && /^https?:/.test(d.data.uploads[0].uploadUrl)' 'presigned upload URL'
H=(); while IFS= read -r line; do [ -n "$line" ] && H+=(-H "$line"); done <<< "$HDRS"
printf '\xff\xd8\xff\xe0test-jpeg-bytes' > "$OUT.jpg"
PUT_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$UPLOAD" "${H[@]}" --data-binary @"$OUT.jpg")"
if [[ "$PUT_STATUS" =~ ^2 ]]; then PASS=$((PASS + 1)); green "    ✓ PUT to storage $PUT_STATUS"; else FAIL=$((FAIL + 1)); red "    ✗ PUT to storage $PUT_STATUS"; fi
call GET "/items/$ITEM4" 200
check 'd.data.attachmentCount===1 && d.data.attachments[0].pages.length===1' 'attachment listed with a signed page URL'
PAGE_URL="$(js 'd.data.attachments[0].pages[0].url')"
BEFORE="$(curl -s -o /dev/null -w '%{http_code}' "$PAGE_URL")"
call DELETE "/items/$ITEM4/attachments/$DOC" 200
sleep 2
AFTER="$(curl -s -o /dev/null -w '%{http_code}' "${PAGE_URL%%v=*}v=after-$STAMP")"
if [ "$BEFORE" = "200" ] && [ "$AFTER" != "200" ]; then PASS=$((PASS + 1)); green "    ✓ the stored file is really deleted (page URL $BEFORE → $AFTER)"; else FAIL=$((FAIL + 1)); red "    ✗ stored file still readable after delete ($BEFORE → $AFTER)"; fi
rm -f "$OUT.jpg"

echo "scans"
call POST /scans 400 '{"source":"fax","pages":[]}'
call POST /scans 201 '{"source":"camera","pages":[{"mime":"image/jpeg","bytes":2048}]}'
SCAN="$(js 'd.data.scan.id')"
check 'd.data.scan.status==="uploading" && d.data.uploads.length===1' 'scan created, one upload'
if [ -n "${SAMPLE_LETTER:-}" ] && [ -f "$SAMPLE_LETTER" ]; then
  call POST /scans 201 "{\"source\":\"library\",\"pages\":[{\"mime\":\"image/jpeg\",\"bytes\":$(wc -c < "$SAMPLE_LETTER")}]}"
  SCAN2="$(js 'd.data.scan.id')"; UP2="$(js 'd.data.uploads[0].uploadUrl')"; HDRS2="$(js 'Object.entries(d.data.uploads[0].headers).map(([k,v])=>k+": "+v).join("\n")')"
  H2=(); while IFS= read -r line; do [ -n "$line" ] && H2+=(-H "$line"); done <<< "$HDRS2"
  curl -s -o /dev/null -X PUT "$UP2" "${H2[@]}" --data-binary @"$SAMPLE_LETTER"
  call POST "/scans/$SCAN2/read" 200,422,503
  echo "    reader answered: $(js 'd.success ? d.data.candidates.map(x=>x.title+" → "+x.dueDate+" ("+x.evidence+")").join(" | ") : d.error.code+" "+(d.error.reason||"")')"
  if [ "$(js 'd.success===true')" = "true" ]; then
    call POST "/scans/$SCAN2/confirm" 200 "$(js 'JSON.stringify({items:[{...d.data.candidates[0],candidateKey:d.data.candidates[0].key,title:d.data.candidates[0].title||"Letter",dueDate:d.data.candidates[0].dueDate||new Date(Date.now()+864e6).toISOString().slice(0,10)}].map(({key,confidence,currency,evidence,...rest})=>rest)})')"
    check 'd.data.items.length===1 && d.data.items[0].attachmentCount===1' 'scan confirmed into a deadline with its page attached'
  fi
else
  echo "    (set SAMPLE_LETTER=/path/to/letter.jpg to exercise the AI read)"
fi
call POST "/scans/$SCAN/read" 409
check 'd.error.code==="CONFLICT" && /upload has not finished/.test(d.error.message)' 'reading before the upload lands → 409, no AI call charged'
call GET /billing/plan 200
check 'd.data.usage.scansThisMonth===1' 'the early read did not count as a scan'
call POST "/scans/$SCAN/confirm" 409 '{"items":[{"title":"x","dueDate":"2026-12-01"}]}'
check 'd.error.code==="CONFLICT"' 'cannot confirm a scan that was never read'
call DELETE "/scans/$SCAN" 200
call GET "/scans/$SCAN" 404

echo "devices + export"
call POST /devices 400 '{}'
call POST /devices 200 '{"expoPushToken":"ExponentPushToken[api-test-'"$STAMP"']","platform":"ios"}'
call POST /devices 200 '{"expoPushToken":"ExponentPushToken[api-test-'"$STAMP"']","platform":"ios"}'
call GET '/export?format=json' 200
check 'Array.isArray(d.items) && d.items.length>=4 && d.household==="The Testers"' 'JSON export'
CSV_STATUS="$(curl -s -o "$OUT" -w '%{http_code}' "$API/export?format=csv" -H "authorization: Bearer $TOKEN")"
if [ "$CSV_STATUS" = "200" ] && head -1 "$OUT" | grep -q '^title,category,action,status,dueDate'; then PASS=$((PASS + 1)); green "    ✓ CSV export with header"; else FAIL=$((FAIL + 1)); red "    ✗ CSV export ($CSV_STATUS)"; fi

echo "household sharing"
call POST /household/invites 201
CODE="$(js 'd.data.code')"; INVITE="$(js 'd.data.id')"
check '/^duebox:\/\/join\//.test(d.data.link) && d.data.code.length===8' 'invite code + deep link'
call GET /household/invites 200
check 'd.data.length===1 && d.data[0].code===undefined' 'invite list never shows the code again'
TOKEN=""
call POST /auth/register 201 "{\"email\":\"$PARTNER_EMAIL\",\"password\":\"$PASSWORD\",\"name\":\"Pat Partner\"}"
PARTNER_TOKEN="$(js 'd.data.accessToken')"; TOKEN="$PARTNER_TOKEN"
call GET /auth/me 200
call POST /items 201 "{\"title\":\"Partner's gym membership\",\"dueDate\":\"$D20\",\"category\":\"subscriptions\",\"action\":\"cancel\"}"
PITEM="$(js 'd.data.id')"
call GET /household/invites/lookup/NOTACODE 404
call GET "/household/invites/lookup/$CODE" 200
check 'd.data.householdName==="The Testers"' 'invite lookup names the household'
call POST /household/join 200 "{\"code\":\"$CODE\"}"
call GET /auth/me 200
check 'd.data.role==="member" && d.data.household.name==="The Testers" && d.data.needsSetup===false && d.data.offerSeen===true' 'partner joined as member; no setup, no offer'
call GET "/items/$PITEM" 200
check 'd.data.title.startsWith("Partner")' 'partner’s own deadline came with them'
call POST /household/join 409 "{\"code\":\"$CODE\"}"
call POST /household/invites 403
call POST /setup 403
TOKEN="$OWNER_TOKEN"
call GET /household/members 200
check 'd.data.length===2 && d.data.some(m=>m.role==="member" && m.initial==="P")' 'owner sees both members'
PARTNER_MEMBER="$(js 'd.data.find(m=>m.role==="member").id')"
call PATCH "/items/$ITEM1" 200 "{\"assigneeId\":\"$PARTNER_MEMBER\"}"
check 'd.data.assigneeId==="'"$PARTNER_MEMBER"'"' 'assign to the partner'
call PATCH "/items/$ITEM1" 400 '{"assigneeId":"00000000-0000-0000-0000-000000000000"}'
call DELETE "/household/invites/$INVITE" 200

echo "reminder job"
SQL="npx tsx --env-file=$(dirname "$0")/../.dev.vars $(dirname "$0")/sql.ts"
call POST /internal/jobs/deliver 403 '' -H 'x-job-secret: wrong'
check 'd.error.code==="FORBIDDEN"' 'the unthrottled job route needs its secret'
# The public tick runs delivery at most every ~2 minutes; open the gate so this run goes now.
$SQL "UPDATE dx__job_tick SET last_at = 'epoch' WHERE name = 'deliver'" >/dev/null 2>&1
call GET /internal/jobs/tick 200
check 'd.data.ran===true && typeof d.data.due==="number"' "tick ran delivery: $(js 'JSON.stringify(d.data)')"
call GET /internal/jobs/tick 200
check 'd.data.ran===false' 'a second tick inside two minutes is a no-op (gated)'
# Pull one of this household's reminders into the past, then deliver it for real through
# Expo. The test token is fake, so Expo refuses it: the reminder must go back in the queue
# (sent_at cleared, attempts + 1), never be lost and never crash the job.
REM="$($SQL "UPDATE dx__reminder SET fire_at = now() - interval '2 minutes' WHERE id = (SELECT id FROM dx__reminder WHERE item_id = \$1::uuid AND sent_at IS NULL AND canceled_at IS NULL ORDER BY fire_at LIMIT 1) RETURNING id" "[\"$ITEM4\"]" 2>/dev/null | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const r=JSON.parse(s||'[]');process.stdout.write(r[0]?.id??'')})")"
if [ -n "$REM" ]; then
  $SQL "UPDATE dx__job_tick SET last_at = 'epoch' WHERE name = 'deliver'" >/dev/null 2>&1
  call GET /internal/jobs/tick 200
  check 'd.data.due>=1' "a due reminder was claimed and pushed: $(js 'JSON.stringify(d.data)')"
  STATE="$($SQL "SELECT sent_at, attempts FROM dx__reminder WHERE id = \$1::uuid" "[\"$REM\"]" 2>/dev/null)"
  if echo "$STATE" | grep -q '"attempts":1' && echo "$STATE" | grep -q '"sent_at":null'; then PASS=$((PASS + 1)); green "    ✓ refused push went back in the queue: $STATE"; else FAIL=$((FAIL + 1)); red "    ✗ reminder state: $STATE"; fi
else
  FAIL=$((FAIL + 1)); red "    ✗ could not find a reminder to pull into the past"
fi

echo "gating after the trial (Free)"
# A fresh account with setup skipped stays Free: 5 items, then 402 item_limit.
TOKEN=""
FREE_EMAIL="apitest+free${STAMP}@duebox.test"
call POST /auth/register 201 "{\"email\":\"$FREE_EMAIL\",\"password\":\"$PASSWORD\"}"
FREE_TOKEN="$(js 'd.data.accessToken')"; TOKEN="$FREE_TOKEN"
call GET /auth/me 200
check 'd.data.plan.tier==="free" && d.data.plan.limits.openItems===5' 'Free before setup'
call POST /items 402 "{\"title\":\"Custom\",\"dueDate\":\"$D20\",\"offsets\":[30]}"
check 'd.error.code==="SUBSCRIPTION_REQUIRED" && d.error.reason==="custom_reminders"' 'Free + custom offsets → 402 custom_reminders'
for i in 1 2 3 4 5; do call POST /items 201 "{\"title\":\"Free item $i\",\"dueDate\":\"$D20\"}"; done
check 'd.data.offsets.join()==="7"' 'Free default offset is 7 days'
call POST /items 402 "{\"title\":\"Sixth\",\"dueDate\":\"$D20\"}"
check 'd.error.reason==="item_limit"' '6th open item → 402 item_limit'
call POST /household/invites 402
check 'd.error.reason==="household"' 'invite on Free → 402 household'
call DELETE /auth/me 400 '{"password":"wrong-password"}'
check 'd.error.code==="INVALID_PASSWORD"' 'delete with a wrong password → 400, account kept'
call DELETE /auth/me 200 "{\"password\":\"$PASSWORD\"}"
call GET /auth/me 401

echo "leave + delete"
TOKEN="$PARTNER_TOKEN"
call POST /household/leave 200
call GET /auth/me 200
check 'd.data.role==="owner" && d.data.household.name!=="The Testers"' 'after leaving, the partner gets a fresh household'
TOKEN="$OWNER_TOKEN"
call GET "/items/$ITEM1" 200
check 'd.data.assigneeId===null' 'their assignment cleared when they left'
echo "remove a member, devices, store webhooks"
TOKEN="$OWNER_TOKEN"
call POST /household/invites 201
CODE2="$(js 'd.data.code')"
TOKEN="$PARTNER_TOKEN"
call POST /household/join 200 "{\"code\":\"$CODE2\"}"
TOKEN="$OWNER_TOKEN"
call GET /household/members 200
PM2="$(js 'd.data.find(m=>m.role==="member").id')"
OWNER_MEMBER="$(js 'd.data.find(m=>m.role==="owner").id')"
call DELETE "/household/members/$OWNER_MEMBER" 400
check 'd.error.code==="VALIDATION_ERROR"' 'the owner cannot remove themself'
call DELETE "/household/members/$PM2" 200
call DELETE "/household/members/$PM2" 404
TOKEN="$PARTNER_TOKEN"
call GET /auth/me 200
check 'd.data.role==="owner" && d.data.household.name!=="The Testers"' 'a removed member lands in a fresh household of their own'
TOKEN="$OWNER_TOKEN"
call DELETE "/devices/ExponentPushToken%5Bapi-test-$STAMP%5D" 200
call POST /billing/restore 503 '{"originalTransactionId":"2000000000000001"}'
check 'd.error.code==="STORE_UNCONFIGURED"' 'restore without store keys → 503, not a crash'
TOKEN=""
call POST /billing/apple/notifications 503 '{"signedPayload":"x.y.z"}'
call POST /billing/google/notifications 503 '{"message":{"data":"e30="}}'

echo "passwords, codes, social callbacks"
# Auth routes allow 10 calls a minute per IP; the suite has used its share.
echo "    (waiting 65 s for the auth rate limit window)"; sleep 65
TOKEN="$OWNER_TOKEN"
call POST /auth/send-code 200
check 'd.data.sent===true' 'a new verification code can be sent'
call POST /auth/change-password 200 "{\"currentPassword\":\"$PASSWORD\",\"newPassword\":\"$PASSWORD-2\"}"
check '(d.data.changed===true) || (d.data.codeSent===true && d.data.email==="'"$OWNER_EMAIL"'")' "change password: $(js 'd.data.changed ? "changed directly" : "current password proven, code emailed to finish"')"
TOKEN=""
call POST /auth/forgot-password 200 "{\"email\":\"$OWNER_EMAIL\"}"
check 'd.data.sent===true' 'reset code requested'
call POST /auth/forgot-password 200 '{"email":"nobody-here@duebox.test"}'
check 'd.data.sent===true' 'same answer for an unknown email (no account oracle)'
call POST /auth/reset-password 400 "{\"email\":\"$OWNER_EMAIL\",\"password\":\"another-Password-9\"}"
check 'd.error.fields.code==="REQUIRED"' 'reset without a code → asks for the code'
call POST /auth/reset-password 400 '{"code":"123456","password":"another-Password-9"}'
check 'd.error.fields.email==="INVALID_EMAIL"' 'reset without the email → asks for it (the platform needs both)'
call POST /auth/reset-password 400 "{\"code\":\"000000\",\"email\":\"$OWNER_EMAIL\",\"password\":\"another-Password-9\"}"
check 'd.error.code==="AUTH_INVALID_CODE"' 'a wrong reset code is refused with a readable message'
echo "    (waiting 65 s for the auth rate limit window)"; sleep 65
call GET '/auth/social/google/start?returnTo=duebox://auth' 200,412
check '(d.success && /^https?:/.test(d.data.url)) || d.error' "Google sign-in start: $(js 'd.success ? "consent URL issued" : d.error.code')"
call GET '/auth/social/apple/start?returnTo=https://evil.example' 200,412
check '!d.success || !d.data.url.includes("evil.example")' 'a foreign returnTo is never passed through'
call GET /auth/social/github/start 400
call POST /auth/social/complete 400,401,404 '{"code":"bogus-code"}'
check 'd.success===false' "a bogus sign-in code is refused ($(js 'd.error.code'))"
call POST /auth/social/id-token 400 '{}'
call POST /auth/social/id-token 400,401,412 '{"provider":"apple","idToken":"not.a.jwt"}'
check 'd.success===false' "a forged Apple token is refused ($(js 'd.error.code'))"
TOKEN="$OWNER_TOKEN"
call POST /auth/logout 200
TOKEN=""
call POST /auth/login 200 "{\"email\":\"$OWNER_EMAIL\",\"password\":\"$PASSWORD\"}"
OWNER_TOKEN="$(js 'd.data.accessToken')"; TOKEN="$OWNER_TOKEN"
call DELETE /auth/me 200 "{\"password\":\"$PASSWORD\"}"
OWNER_TOKEN=""
call GET /auth/me 401
TOKEN="$PARTNER_TOKEN"
call DELETE /auth/me 200 '{"confirmation":"delete"}'
PARTNER_TOKEN=""
FREE_TOKEN=""

echo
if [ "$FAIL" -eq 0 ]; then green "ALL PASSED — $PASS checks"; else red "$FAIL FAILED, $PASS passed"; fi
exit "$FAIL"
