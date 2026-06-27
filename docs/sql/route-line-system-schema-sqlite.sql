-- 线路系统建表参考：SQLite
-- 仅在当前数据库为 SQLite 时执行本文件。
-- 本文件前半部分为建表 SQL，后半部分为追加字段迁移 SQL。
-- SQLite 不支持原生表备注或字段备注，以下使用 SQL 注释保留说明。

-- ============================================================
-- 建表：线路主表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  visible INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 10,
  remark TEXT,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
);

-- route_lines 字段：
--   id          主键 ID。
--   code        线路唯一编码，用于 API 和后台配置引用。
--   name        线路展示名称。
--   description 线路说明，通常用于后台管理展示。
--   is_default  历史保留字段；渠道默认线路以 channel_route_bindings.is_default 为准。
--   visible     是否对用户或模型列表可见。
--   enabled     是否启用；禁用后不参与线路选择。
--   sort        展示排序，升序排列。
--   remark      运营内部备注。
--   created_at  创建时间，由应用或 GORM 维护。
--   updated_at  更新时间，由应用或 GORM 维护。
CREATE UNIQUE INDEX IF NOT EXISTS idx_route_lines_code
  ON route_lines (code);
CREATE INDEX IF NOT EXISTS idx_route_lines_sort
  ON route_lines (sort);

-- ============================================================
-- 建表：线路模型价格表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_line_model_prices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  route_line_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  billing_mode TEXT NOT NULL,
  ratio REAL NULL,
  per_request_price REAL NULL,
  price_expression TEXT NULL,
  description TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
);

-- route_line_model_prices 字段：
--   id                主键 ID。
--   route_line_id     所属线路 ID，对应 route_lines.id。
--   model_name        模型名称，按请求或上游模型名精确匹配。
--   billing_mode      计费模式：ratio 或 per_request；expression 为后续预留。
--   ratio             倍率计费值；billing_mode=ratio 时使用。
--   per_request_price 单次请求固定价格；billing_mode=per_request 时使用。
--   price_expression  预留动态计费表达式。
--   description       该模型价格配置的运营说明。
--   enabled           是否启用该模型价格配置。
--   created_at        创建时间，由应用或 GORM 维护。
--   updated_at        更新时间，由应用或 GORM 维护。
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
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_id INTEGER NOT NULL,
  route_line_id INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 0,
  weight INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
);

-- channel_route_bindings 字段：
--   id            主键 ID。
--   channel_id    渠道 ID，对应 channels.id。
--   route_line_id 线路 ID，对应 route_lines.id。
--   enabled       是否启用该渠道线路绑定。
--   priority      绑定优先级，当前预加载按优先级倒序返回。
--   weight        绑定级权重预留字段，启用调度前需明确语义。
--   description   该渠道绑定到线路的运营说明。
--   created_at    创建时间，由应用或 GORM 维护。
--   updated_at    更新时间，由应用或 GORM 维护。
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
-- SQLite 不能重复添加同名字段。
-- 如果字段已经存在，请跳过对应 ALTER TABLE 语句。

ALTER TABLE route_lines
  ADD COLUMN default_ratio REAL NULL DEFAULT 1;

UPDATE route_lines
SET default_ratio = 1
WHERE default_ratio IS NULL;

-- ============================================================
-- 追加迁移：渠道默认线路绑定
-- ============================================================
-- 同一个渠道只能有一条默认线路绑定，由应用层保存绑定时保证。
-- 如果字段已经存在，请跳过对应 ALTER TABLE 语句。

ALTER TABLE channel_route_bindings
  ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_channel_route_bindings_channel_default
  ON channel_route_bindings (channel_id, is_default);

-- ============================================================
-- 追加迁移：线路槽位
-- ============================================================
-- 槽位用于表达“某一类模型请求默认走哪条线路”。
-- 用户或 API 密钥选择“跟随默认”时，读取的是槽位当前的 default_route_line_id；
-- 因此管理员切换槽位默认线路后，所有跟随默认的用户或密钥都会自动生效。
-- SQLite 不支持原生表备注或字段备注，以下使用 SQL 注释保留说明。

CREATE TABLE IF NOT EXISTS route_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_route_line_id INTEGER NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0,
  remark TEXT,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
);

-- route_slots 字段：
--   id                    主键 ID。
--   code                  槽位唯一编码，例如 gpt_chat、gpt_image、gemini_chat。
--   name                  槽位展示名称。
--   description           槽位说明，描述这个槽位覆盖的模型类型或业务场景。
--   default_route_line_id 该槽位当前默认线路 ID；跟随默认的用户或密钥会动态读取此值。
--   enabled               是否启用该槽位。
--   sort                  展示排序，升序排列。
--   remark                运营内部备注。
--   created_at            创建时间，由应用层 GORM 维护。
--   updated_at            更新时间，由应用层 GORM 维护。

CREATE UNIQUE INDEX IF NOT EXISTS idx_route_slots_code
  ON route_slots (code);
CREATE INDEX IF NOT EXISTS idx_route_slots_sort
  ON route_slots (sort);
CREATE INDEX IF NOT EXISTS idx_route_slots_default_route_line_id
  ON route_slots (default_route_line_id);

-- 如果 slot_id 字段已经存在，请跳过下面这条 ALTER TABLE。
ALTER TABLE route_lines
  ADD COLUMN slot_id INTEGER NULL;

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
--   SQLite 不支持原生表备注或字段备注，以下使用 SQL 注释保留说明。
--   本表不创建外键约束，避免已有数据或不同数据库迁移状态导致执行失败；
--   token_id、route_slot_id、route_line_id 的有效性由后端保存接口校验。

CREATE TABLE IF NOT EXISTS api_key_route_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_id INTEGER NOT NULL,
  route_slot_id INTEGER NOT NULL,
  route_line_id INTEGER NOT NULL,
  created_at DATETIME NULL,
  updated_at DATETIME NULL
);

-- api_key_route_overrides 字段：
--   id            主键 ID。
--   token_id      API 密钥 ID，对应 tokens.id。
--   route_slot_id 线路槽位 ID，对应 route_slots.id。
--   route_line_id 覆盖后的线路 ID，对应 route_lines.id。
--   created_at    创建时间，由应用层 GORM 维护。
--   updated_at    更新时间，由应用层 GORM 维护。

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_key_route_overrides_token_slot
  ON api_key_route_overrides (token_id, route_slot_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_token_id
  ON api_key_route_overrides (token_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_route_slot_id
  ON api_key_route_overrides (route_slot_id);

CREATE INDEX IF NOT EXISTS idx_api_key_route_overrides_route_line_id
  ON api_key_route_overrides (route_line_id);
