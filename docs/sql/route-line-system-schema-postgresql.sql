-- 线路系统建表参考：PostgreSQL 9.6+
-- 仅在当前数据库为 PostgreSQL 时执行本文件。
-- 本文件前半部分为建表 SQL，后半部分为追加字段迁移 SQL。

-- ============================================================
-- 建表：线路主表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_lines (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 10,
  remark VARCHAR(255),
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE route_lines IS '线路系统：线路主表';
COMMENT ON COLUMN route_lines.id IS '主键 ID';
COMMENT ON COLUMN route_lines.code IS '线路唯一编码，用于 API 和后台配置引用';
COMMENT ON COLUMN route_lines.name IS '线路展示名称';
COMMENT ON COLUMN route_lines.description IS '线路说明，通常用于后台管理展示';
COMMENT ON COLUMN route_lines.is_default IS '历史保留字段；渠道默认线路以 channel_route_bindings.is_default 为准';
COMMENT ON COLUMN route_lines.visible IS '是否对用户或模型列表可见';
COMMENT ON COLUMN route_lines.enabled IS '是否启用；禁用后不参与线路选择';
COMMENT ON COLUMN route_lines.sort IS '展示排序，升序排列';
COMMENT ON COLUMN route_lines.remark IS '运营内部备注';
COMMENT ON COLUMN route_lines.created_at IS '创建时间，由应用或 GORM 维护';
COMMENT ON COLUMN route_lines.updated_at IS '更新时间，由应用或 GORM 维护';

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_lines_code
  ON route_lines (code);
CREATE INDEX IF NOT EXISTS idx_route_lines_sort
  ON route_lines (sort);

-- ============================================================
-- 建表：线路模型价格表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_line_model_prices (
  id SERIAL PRIMARY KEY,
  route_line_id INTEGER NOT NULL,
  model_name VARCHAR(191) NOT NULL,
  billing_mode VARCHAR(32) NOT NULL,
  ratio DOUBLE PRECISION NULL,
  per_request_price DOUBLE PRECISION NULL,
  price_expression TEXT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE route_line_model_prices IS '线路系统：线路模型价格表';
COMMENT ON COLUMN route_line_model_prices.id IS '主键 ID';
COMMENT ON COLUMN route_line_model_prices.route_line_id IS '所属线路 ID，对应 route_lines.id';
COMMENT ON COLUMN route_line_model_prices.model_name IS '模型名称，按请求或上游模型名精确匹配';
COMMENT ON COLUMN route_line_model_prices.billing_mode IS '计费模式：ratio 或 per_request；expression 为后续预留';
COMMENT ON COLUMN route_line_model_prices.ratio IS '倍率计费值；billing_mode=ratio 时使用';
COMMENT ON COLUMN route_line_model_prices.per_request_price IS '单次请求固定价格；billing_mode=per_request 时使用';
COMMENT ON COLUMN route_line_model_prices.price_expression IS '预留动态计费表达式';
COMMENT ON COLUMN route_line_model_prices.description IS '该模型价格配置的运营说明';
COMMENT ON COLUMN route_line_model_prices.enabled IS '是否启用该模型价格配置';
COMMENT ON COLUMN route_line_model_prices.created_at IS '创建时间，由应用或 GORM 维护';
COMMENT ON COLUMN route_line_model_prices.updated_at IS '更新时间，由应用或 GORM 维护';

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_line_model_price
  ON route_line_model_prices (route_line_id, model_name);
CREATE INDEX IF NOT EXISTS idx_route_line_model_prices_route_line_id
  ON route_line_model_prices (route_line_id);
CREATE INDEX IF NOT EXISTS idx_route_line_model_prices_model_name
  ON route_line_model_prices (model_name);
CREATE INDEX IF NOT EXISTS idx_route_line_model_prices_billing_mode
  ON route_line_model_prices (billing_mode);

-- ============================================================
-- 建表：渠道线路绑定表
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_route_bindings (
  id SERIAL PRIMARY KEY,
  channel_id INTEGER NOT NULL,
  route_line_id INTEGER NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  priority INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE channel_route_bindings IS '线路系统：渠道线路绑定表';
COMMENT ON COLUMN channel_route_bindings.id IS '主键 ID';
COMMENT ON COLUMN channel_route_bindings.channel_id IS '渠道 ID，对应 channels.id';
COMMENT ON COLUMN channel_route_bindings.route_line_id IS '线路 ID，对应 route_lines.id';
COMMENT ON COLUMN channel_route_bindings.enabled IS '是否启用该渠道线路绑定';
COMMENT ON COLUMN channel_route_bindings.priority IS '绑定优先级，当前预加载按优先级倒序返回';
COMMENT ON COLUMN channel_route_bindings.weight IS '绑定级权重预留字段，启用调度前需明确语义';
COMMENT ON COLUMN channel_route_bindings.description IS '该渠道绑定到线路的运营说明';
COMMENT ON COLUMN channel_route_bindings.created_at IS '创建时间，由应用或 GORM 维护';
COMMENT ON COLUMN channel_route_bindings.updated_at IS '更新时间，由应用或 GORM 维护';

CREATE UNIQUE INDEX IF NOT EXISTS idx_channel_route_binding
  ON channel_route_bindings (channel_id, route_line_id);
CREATE INDEX IF NOT EXISTS idx_channel_route_bindings_channel_id
  ON channel_route_bindings (channel_id);
CREATE INDEX IF NOT EXISTS idx_channel_route_bindings_route_line_id
  ON channel_route_bindings (route_line_id);
CREATE INDEX IF NOT EXISTS idx_channel_route_bindings_priority
  ON channel_route_bindings (priority);

-- ============================================================
-- 追加迁移：线路默认倍率
-- ============================================================

ALTER TABLE route_lines
  ADD COLUMN IF NOT EXISTS default_ratio DOUBLE PRECISION NULL;

UPDATE route_lines
SET default_ratio = 1
WHERE default_ratio IS NULL;

ALTER TABLE route_lines
  ALTER COLUMN default_ratio SET DEFAULT 1;

COMMENT ON COLUMN route_lines.default_ratio IS
  '线路默认倍率。默认 1 表示按官方价格计算。';

-- ============================================================
-- 追加迁移：渠道默认线路绑定
-- ============================================================
-- 同一个渠道只能有一条默认线路绑定，由应用层保存绑定时保证。

ALTER TABLE channel_route_bindings
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN channel_route_bindings.is_default IS
  '是否为该渠道的默认线路绑定。';

CREATE INDEX IF NOT EXISTS idx_channel_route_bindings_channel_default
  ON channel_route_bindings (channel_id, is_default);

-- ============================================================
-- 追加迁移：线路槽位
-- ============================================================
-- 槽位用于表达“某一类模型请求默认走哪条线路”。
-- 用户或 API 密钥选择“跟随默认”时，读取的是槽位当前的 default_route_line_id；
-- 因此管理员切换槽位默认线路后，所有跟随默认的用户或密钥都会自动生效。

CREATE TABLE IF NOT EXISTS route_slots (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  default_route_line_id INTEGER NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0,
  remark VARCHAR(255),
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE route_slots IS '线路槽位表：用于把 GPT 聊天、GPT 生图、Gemini 聊天等可替换默认线路分组';
COMMENT ON COLUMN route_slots.id IS '主键 ID';
COMMENT ON COLUMN route_slots.code IS '槽位唯一编码，例如 gpt_chat、gpt_image、gemini_chat';
COMMENT ON COLUMN route_slots.name IS '槽位展示名称';
COMMENT ON COLUMN route_slots.description IS '槽位说明，描述这个槽位覆盖的模型类型或业务场景';
COMMENT ON COLUMN route_slots.default_route_line_id IS '该槽位当前默认线路 ID；跟随默认的用户或密钥会动态读取此值';
COMMENT ON COLUMN route_slots.enabled IS '是否启用该槽位';
COMMENT ON COLUMN route_slots.sort IS '展示排序，升序排列';
COMMENT ON COLUMN route_slots.remark IS '运营内部备注';
COMMENT ON COLUMN route_slots.created_at IS '创建时间，由应用层 GORM 维护';
COMMENT ON COLUMN route_slots.updated_at IS '更新时间，由应用层 GORM 维护';

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_slots_code
  ON route_slots (code);
CREATE INDEX IF NOT EXISTS idx_route_slots_sort
  ON route_slots (sort);
CREATE INDEX IF NOT EXISTS idx_route_slots_default_route_line_id
  ON route_slots (default_route_line_id);

ALTER TABLE route_lines
  ADD COLUMN IF NOT EXISTS slot_id INTEGER NULL;

COMMENT ON COLUMN route_lines.slot_id IS
  '所属线路槽位 ID；用于判断该线路替换的是哪个槽位的默认线路';

CREATE INDEX IF NOT EXISTS idx_route_lines_slot_id
  ON route_lines (slot_id);

-- ============================================================
-- 追加迁移：API 密钥线路覆盖
-- ============================================================
-- 用途：
--   1. API 密钥不设置覆盖记录时，按 route_slots.default_route_line_id 跟随默认线路。
--   2. API 密钥设置覆盖记录时，指定某个槽位固定使用某条线路。
--   3. 同一个 API 密钥在同一个槽位内最多只能覆盖一条线路。
-- 说明：
--   本表不创建外键约束，避免已有数据或不同数据库迁移状态导致执行失败；
--   token_id、route_slot_id、route_line_id 的有效性由后端保存接口校验。

CREATE TABLE IF NOT EXISTS api_key_route_overrides (
  id SERIAL PRIMARY KEY,
  token_id INTEGER NOT NULL,
  route_slot_id INTEGER NOT NULL,
  route_line_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NULL
);

COMMENT ON TABLE api_key_route_overrides IS
  'API 密钥线路覆盖表：记录某个 API 密钥在某个线路槽位下固定使用哪条线路';
COMMENT ON COLUMN api_key_route_overrides.id IS '主键 ID';
COMMENT ON COLUMN api_key_route_overrides.token_id IS 'API 密钥 ID，对应 tokens.id';
COMMENT ON COLUMN api_key_route_overrides.route_slot_id IS '线路槽位 ID，对应 route_slots.id';
COMMENT ON COLUMN api_key_route_overrides.route_line_id IS '覆盖后的线路 ID，对应 route_lines.id';
COMMENT ON COLUMN api_key_route_overrides.created_at IS '创建时间，由应用层 GORM 维护';
COMMENT ON COLUMN api_key_route_overrides.updated_at IS '更新时间，由应用层 GORM 维护';

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key_route_overrides_token_slot
  ON api_key_route_overrides (token_id, route_slot_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_token_id
  ON api_key_route_overrides (token_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_route_slot_id
  ON api_key_route_overrides (route_slot_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_route_line_id
  ON api_key_route_overrides (route_line_id);
