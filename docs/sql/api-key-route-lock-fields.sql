-- API 密钥线路锁定字段迁移。
--
-- 请只执行与你当前数据库匹配的段落。
-- 如果字段或索引已经存在，请跳过对应语句。

-- ============================================================
-- MySQL 5.7.8+
-- ============================================================

ALTER TABLE tokens
  ADD COLUMN route_locked TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否由管理员锁定 API 密钥线路';

ALTER TABLE tokens
  ADD COLUMN locked_route_slot_id INT NULL COMMENT '管理员锁定的线路槽位 ID';

ALTER TABLE tokens
  ADD COLUMN locked_route_line_id INT NULL COMMENT '管理员锁定的线路 ID';

CREATE INDEX idx_tokens_route_lock
  ON tokens (route_locked, locked_route_slot_id, locked_route_line_id);

-- ============================================================
-- PostgreSQL 9.6+
-- ============================================================

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS route_locked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS locked_route_slot_id INTEGER NULL;

ALTER TABLE tokens
  ADD COLUMN IF NOT EXISTS locked_route_line_id INTEGER NULL;

COMMENT ON COLUMN tokens.route_locked IS '是否由管理员锁定 API 密钥线路';
COMMENT ON COLUMN tokens.locked_route_slot_id IS '管理员锁定的线路槽位 ID';
COMMENT ON COLUMN tokens.locked_route_line_id IS '管理员锁定的线路 ID';

CREATE INDEX IF NOT EXISTS idx_tokens_route_lock
  ON tokens (route_locked, locked_route_slot_id, locked_route_line_id);

-- ============================================================
-- SQLite
-- ============================================================

ALTER TABLE tokens
  ADD COLUMN route_locked INTEGER NOT NULL DEFAULT 0;

ALTER TABLE tokens
  ADD COLUMN locked_route_slot_id INTEGER NULL;

ALTER TABLE tokens
  ADD COLUMN locked_route_line_id INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_tokens_route_lock
  ON tokens (route_locked, locked_route_slot_id, locked_route_line_id);
