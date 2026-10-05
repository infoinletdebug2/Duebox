import type { Migration } from '@xenition/sdk';

/**
 * Duebox's tables (CONTRACT §4). Prefix `dx__` (the platform's plan cache is
 * keyed by table name across apps). Every household row carries
 * `household_id`, and every query filters on it from the caller's membership
 * (BR-01). Money is integer cents. Soft-deleted: dx__item, dx__document,
 * dx__household (lib.ts SOFT_DELETED).
 *
 * One statement per id; an applied id's SQL never changes — add a new one.
 */

const ts = `created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()`;

const hh = `household_id uuid NOT NULL REFERENCES dx__household(id) ON DELETE CASCADE`;

export const APP_MIGRATIONS: Migration[] = [
  {
    id: 'dx/0001_create_profile',
    sql: `CREATE TABLE IF NOT EXISTS dx__profile (
  user_id text PRIMARY KEY,
  name text,
  email_verified_at timestamptz,
  prefs_reminders boolean NOT NULL DEFAULT true,
  prefs_overdue boolean NOT NULL DEFAULT true,
  setup_done_at timestamptz,
  offer_seen_at timestamptz,
  fb_anon_id text,
  att_status text,
  install_platform text,
  app_version text,
  os_version text,
  device_model text,
  locale text,
  attribution_updated_at timestamptz,
  ${ts}
)`,
  },
  {
    id: 'dx/0002_create_household',
    sql: `CREATE TABLE IF NOT EXISTS dx__household (
  id uuid PRIMARY KEY,
  owner_user_id text NOT NULL,
  name text NOT NULL DEFAULT 'Your home',
  timezone text NOT NULL DEFAULT 'America/New_York',
  currency text NOT NULL DEFAULT 'USD',
  remind_hour smallint NOT NULL DEFAULT 9 CHECK (remind_hour BETWEEN 0 AND 23),
  focus text[] NOT NULL DEFAULT '{}',
  ${ts},
  deleted_at timestamptz
)`,
  },
  {
    id: 'dx/0003_create_member',
    sql: `CREATE TABLE IF NOT EXISTS dx__member (
  id uuid PRIMARY KEY,
  ${hh},
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','member')),
  display_name text NOT NULL,
  email text,
  removed_at timestamptz,
  ${ts}
)`,
  },
  {
    id: 'dx/0004_index_member_one_household',
    sql: `CREATE UNIQUE INDEX IF NOT EXISTS dx__member_one_household ON dx__member (user_id) WHERE removed_at IS NULL`,
  },
  {
    id: 'dx/0005_create_invite',
    sql: `CREATE TABLE IF NOT EXISTS dx__invite (
  id uuid PRIMARY KEY,
  ${hh},
  code_hash text NOT NULL UNIQUE,
  created_by uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by text,
  revoked_at timestamptz,
  ${ts}
)`,
  },
  {
    id: 'dx/0006_create_item',
    sql: `CREATE TABLE IF NOT EXISTS dx__item (
  id uuid PRIMARY KEY,
  ${hh},
  series_id uuid NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  category text NOT NULL,
  action text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
  due_date date NOT NULL,
  amount_cents integer CHECK (amount_cents >= 0),
  issuer text,
  reference_last4 text CHECK (char_length(reference_last4) <= 4),
  notes text,
  repeat text NOT NULL DEFAULT 'none',
  repeat_years smallint,
  offsets smallint[] NOT NULL DEFAULT '{7}',
  assignee_id uuid REFERENCES dx__member(id) ON DELETE SET NULL,
  source text NOT NULL CHECK (source IN ('scan','manual','repeat')),
  evidence text,
  done_at timestamptz,
  done_by uuid,
  created_by uuid,
  deleted_at timestamptz,
  ${ts}
)`,
  },
  {
    id: 'dx/0007_index_item_open',
    sql: `CREATE INDEX IF NOT EXISTS dx__item_household_status_due ON dx__item (household_id, status, due_date) WHERE deleted_at IS NULL`,
  },
  {
    id: 'dx/0008_create_reminder',
    sql: `CREATE TABLE IF NOT EXISTS dx__reminder (
  id uuid PRIMARY KEY,
  ${hh},
  item_id uuid NOT NULL REFERENCES dx__item(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before','due','overdue','snooze')),
  offset_days smallint,
  fire_at timestamptz NOT NULL,
  sent_at timestamptz,
  attempts smallint NOT NULL DEFAULT 0,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    id: 'dx/0009_index_reminder_due',
    sql: `CREATE INDEX IF NOT EXISTS dx__reminder_pending ON dx__reminder (fire_at) WHERE sent_at IS NULL AND canceled_at IS NULL`,
  },
  {
    id: 'dx/0010_create_document',
    sql: `CREATE TABLE IF NOT EXISTS dx__document (
  id uuid PRIMARY KEY,
  ${hh},
  purpose text NOT NULL CHECK (purpose IN ('scan','attachment')),
  status text NOT NULL,
  source text,
  page_count smallint NOT NULL DEFAULT 0,
  draft jsonb,
  model text,
  read_error text,
  read_ms integer,
  created_by uuid,
  confirmed_at timestamptz,
  deleted_at timestamptz,
  ${ts}
)`,
  },
  {
    id: 'dx/0011_create_item_document',
    sql: `CREATE TABLE IF NOT EXISTS dx__item_document (
  item_id uuid NOT NULL REFERENCES dx__item(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES dx__document(id) ON DELETE CASCADE,
  ${hh},
  PRIMARY KEY (item_id, document_id)
)`,
  },
  {
    id: 'dx/0012_create_page',
    sql: `CREATE TABLE IF NOT EXISTS dx__page (
  id uuid PRIMARY KEY,
  ${hh},
  document_id uuid NOT NULL REFERENCES dx__document(id) ON DELETE CASCADE,
  idx smallint NOT NULL,
  storage_key text NOT NULL,
  mime text NOT NULL,
  bytes integer,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    id: 'dx/0013_create_device',
    sql: `CREATE TABLE IF NOT EXISTS dx__device (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  expo_push_token text NOT NULL UNIQUE,
  platform text,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    id: 'dx/0014_create_usage',
    sql: `CREATE TABLE IF NOT EXISTS dx__usage (
  ${hh},
  month text NOT NULL,
  scans integer NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, month)
)`,
  },
  {
    id: 'dx/0015_create_idempotency',
    sql: `CREATE TABLE IF NOT EXISTS dx__idempotency (
  key text PRIMARY KEY,
  user_id text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`,
  },
  {
    id: 'dx/0016_create_job_tick',
    sql: `CREATE TABLE IF NOT EXISTS dx__job_tick (
  name text PRIMARY KEY,
  last_at timestamptz NOT NULL DEFAULT 'epoch'
)`,
  },
  {
    id: 'dx/0017_seed_job_tick_deliver',
    sql: `INSERT INTO dx__job_tick (name, last_at) VALUES ('deliver', 'epoch') ON CONFLICT (name) DO NOTHING`,
  },
];
