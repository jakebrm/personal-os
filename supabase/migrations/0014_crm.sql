-- Agency CRM — clients/deals pipeline + activity log

CREATE TABLE IF NOT EXISTS crm_contacts (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          text        NOT NULL DEFAULT 'owner',
  name             text        NOT NULL,
  company          text,
  role             text,
  email            text,
  phone            text,
  instagram        text,
  source           text,       -- referral, instagram, cold, inbound, …
  notes            text,
  stage            text        NOT NULL DEFAULT 'lead'
                               CHECK (stage IN ('lead','contacted','proposal','active','won','lost')),
  value_usd        integer     NOT NULL DEFAULT 0,
  next_action      text,
  next_action_date date,
  last_touch_at    date,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crm_activities (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id  uuid        NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  user_id     text        NOT NULL DEFAULT 'owner',
  date        date        NOT NULL DEFAULT CURRENT_DATE,
  type        text        NOT NULL DEFAULT 'note'
              CHECK (type IN ('call','email','dm','meeting','shoot','delivery','invoice','note')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user    ON crm_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_stage   ON crm_contacts(stage);
CREATE INDEX IF NOT EXISTS idx_crm_activities_contact ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_date  ON crm_activities(date DESC);

-- Trigger: auto-update crm_contacts.updated_at
CREATE OR REPLACE FUNCTION set_crm_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_crm_contacts_updated_at ON crm_contacts;
CREATE TRIGGER trg_crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION set_crm_contacts_updated_at();
