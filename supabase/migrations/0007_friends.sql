-- Keep in Touch — friends + interaction log

CREATE TABLE IF NOT EXISTS friends (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                text        NOT NULL DEFAULT 'owner',
  name                   text        NOT NULL,
  nickname               text,
  relationship           text        NOT NULL DEFAULT 'friend'
                                     CHECK (relationship IN ('friend','family','colleague','mentor','other')),
  phone                  text,
  email                  text,
  instagram              text,
  birthday               date,
  city                   text,
  notes                  text,
  photo_url              text,
  contact_frequency_days integer     NOT NULL DEFAULT 30,
  last_contacted_at      date,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friend_interactions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id   uuid        NOT NULL REFERENCES friends(id) ON DELETE CASCADE,
  user_id     text        NOT NULL DEFAULT 'owner',
  date        date        NOT NULL DEFAULT CURRENT_DATE,
  type        text        NOT NULL DEFAULT 'other'
              CHECK (type IN ('call','text','coffee','dinner','visit','other')),
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_friends_user       ON friends(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_friend ON friend_interactions(friend_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date   ON friend_interactions(date DESC);

-- Trigger: auto-update friends.updated_at
CREATE OR REPLACE FUNCTION set_friends_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_friends_updated_at ON friends;
CREATE TRIGGER trg_friends_updated_at
  BEFORE UPDATE ON friends
  FOR EACH ROW EXECUTE FUNCTION set_friends_updated_at();
