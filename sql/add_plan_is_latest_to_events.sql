ALTER TABLE events
ADD COLUMN IF NOT EXISTS plan_is_latest boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN events.plan_is_latest IS '配車結果が最新かどうかを示すフラグ。true=最新、false=再配車が必要';
