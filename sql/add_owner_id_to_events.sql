ALTER TABLE events
ADD COLUMN IF NOT EXISTS owner_id text;

CREATE INDEX IF NOT EXISTS events_owner_id_created_at_idx
ON events (owner_id, created_at DESC);

COMMENT ON COLUMN events.owner_id IS '匿名ユーザー識別子。Cookieに保存したowner_idで作成イベントを限定表示するための値';
