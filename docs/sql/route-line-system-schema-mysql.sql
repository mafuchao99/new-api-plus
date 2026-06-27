-- 线路系统建表参考：MySQL 5.7.8+
-- 仅在当前数据库为 MySQL 时执行本文件。
-- 本文件前半部分为建表 SQL，后半部分为追加字段迁移 SQL。

-- ============================================================
-- 建表：线路主表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_lines (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  code VARCHAR(64) NOT NULL COMMENT '线路唯一编码，用于 API 和后台配置引用',
  name VARCHAR(128) NOT NULL COMMENT '线路展示名称',
  description TEXT COMMENT '线路说明，通常用于后台管理展示',
  is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '历史保留字段；渠道默认线路以 channel_route_bindings.is_default 为准',
  visible TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否对用户或模型列表可见',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用；禁用后不参与线路选择',
  sort INT NOT NULL DEFAULT 10 COMMENT '展示排序，升序排列',
  remark VARCHAR(255) COMMENT '运营内部备注',
  created_at DATETIME(3) NULL COMMENT '创建时间，由应用或 GORM 维护',
  updated_at DATETIME(3) NULL COMMENT '更新时间，由应用或 GORM 维护',
  PRIMARY KEY (id),
  UNIQUE KEY idx_route_lines_code (code),
  KEY idx_route_lines_sort (sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='线路系统：线路主表';

-- ============================================================
-- 建表：线路模型价格表
-- ============================================================

CREATE TABLE IF NOT EXISTS route_line_model_prices (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  route_line_id INT NOT NULL COMMENT '所属线路 ID，对应 route_lines.id',
  model_name VARCHAR(191) NOT NULL COMMENT '模型名称，按请求或上游模型名精确匹配',
  billing_mode VARCHAR(32) NOT NULL COMMENT '计费模式：ratio 或 per_request；expression 为后续预留',
  ratio DOUBLE NULL COMMENT '倍率计费值；billing_mode=ratio 时使用',
  per_request_price DOUBLE NULL COMMENT '单次请求固定价格；billing_mode=per_request 时使用',
  price_expression TEXT NULL COMMENT '预留动态计费表达式',
  description TEXT COMMENT '该模型价格配置的运营说明',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用该模型价格配置',
  created_at DATETIME(3) NULL COMMENT '创建时间，由应用或 GORM 维护',
  updated_at DATETIME(3) NULL COMMENT '更新时间，由应用或 GORM 维护',
  PRIMARY KEY (id),
  UNIQUE KEY idx_route_line_model_price (route_line_id, model_name),
  KEY idx_route_line_model_prices_route_line_id (route_line_id),
  KEY idx_route_line_model_prices_model_name (model_name),
  KEY idx_route_line_model_prices_billing_mode (billing_mode)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='线路系统：线路模型价格表';

-- ============================================================
-- 建表：渠道线路绑定表
-- ============================================================

CREATE TABLE IF NOT EXISTS channel_route_bindings (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  channel_id INT NOT NULL COMMENT '渠道 ID，对应 channels.id',
  route_line_id INT NOT NULL COMMENT '线路 ID，对应 route_lines.id',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用该渠道线路绑定',
  priority INT NOT NULL DEFAULT 0 COMMENT '绑定优先级，当前预加载按优先级倒序返回',
  weight INT NOT NULL DEFAULT 0 COMMENT '绑定级权重预留字段，启用调度前需明确语义',
  description TEXT COMMENT '该渠道绑定到线路的运营说明',
  created_at DATETIME(3) NULL COMMENT '创建时间，由应用或 GORM 维护',
  updated_at DATETIME(3) NULL COMMENT '更新时间，由应用或 GORM 维护',
  PRIMARY KEY (id),
  UNIQUE KEY idx_channel_route_binding (channel_id, route_line_id),
  KEY idx_channel_route_bindings_channel_id (channel_id),
  KEY idx_channel_route_bindings_route_line_id (route_line_id),
  KEY idx_channel_route_bindings_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='线路系统：渠道线路绑定表';

-- ============================================================
-- 追加迁移：线路默认倍率
-- ============================================================
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS。
-- 如果字段已经存在，请跳过对应 ALTER TABLE 语句。

ALTER TABLE route_lines
  ADD COLUMN default_ratio DOUBLE NULL DEFAULT 1 COMMENT '线路默认倍率。默认 1 表示按官方价格计算。';

UPDATE route_lines
SET default_ratio = 1
WHERE default_ratio IS NULL;

ALTER TABLE route_lines
  MODIFY COLUMN default_ratio DOUBLE NULL DEFAULT 1 COMMENT '线路默认倍率。默认 1 表示按官方价格计算。';

-- ============================================================
-- 追加迁移：渠道默认线路绑定
-- ============================================================
-- 同一个渠道只能有一条默认线路绑定，由应用层保存绑定时保证。
-- 如果字段或索引已经存在，请跳过对应语句。

ALTER TABLE channel_route_bindings
  ADD COLUMN is_default TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否为该渠道的默认线路绑定。';

CREATE INDEX idx_channel_route_bindings_channel_default
  ON channel_route_bindings (channel_id, is_default);

-- ============================================================
-- 追加迁移：线路槽位
-- ============================================================
-- 槽位用于表达“某一类模型请求默认走哪条线路”。
-- 用户或 API 密钥选择“跟随默认”时，读取的是槽位当前的 default_route_line_id；
-- 因此管理员切换槽位默认线路后，所有跟随默认的用户或密钥都会自动生效。
-- MySQL 5.7 不支持 ADD COLUMN IF NOT EXISTS。
-- 如果表、字段或索引已经存在，请跳过对应语句。

CREATE TABLE IF NOT EXISTS route_slots (
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  code VARCHAR(64) NOT NULL COMMENT '槽位唯一编码，例如 gpt_chat、gpt_image、gemini_chat',
  name VARCHAR(128) NOT NULL COMMENT '槽位展示名称',
  description TEXT COMMENT '槽位说明，描述这个槽位覆盖的模型类型或业务场景',
  default_route_line_id INT NULL COMMENT '该槽位当前默认线路 ID；跟随默认的用户或密钥会动态读取此值',
  enabled TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用该槽位',
  sort INT NOT NULL DEFAULT 0 COMMENT '展示排序，升序排列',
  remark VARCHAR(255) COMMENT '运营内部备注',
  created_at DATETIME(3) NULL COMMENT '创建时间，由应用层 GORM 维护',
  updated_at DATETIME(3) NULL COMMENT '更新时间，由应用层 GORM 维护',
  PRIMARY KEY (id),
  UNIQUE KEY idx_route_slots_code (code),
  KEY idx_route_slots_sort (sort),
  KEY idx_route_slots_default_route_line_id (default_route_line_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='线路槽位表：用于把 GPT 聊天、GPT 生图、Gemini 聊天等可替换默认线路分组';

ALTER TABLE route_lines
  ADD COLUMN slot_id INT NULL COMMENT '所属线路槽位 ID；用于判断该线路替换的是哪个槽位的默认线路';

CREATE INDEX idx_route_lines_slot_id
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
  id INT NOT NULL AUTO_INCREMENT COMMENT '主键 ID',
  token_id INT NOT NULL COMMENT 'API 密钥 ID，对应 tokens.id',
  route_slot_id INT NOT NULL COMMENT '线路槽位 ID，对应 route_slots.id',
  route_line_id INT NOT NULL COMMENT '覆盖后的线路 ID，对应 route_lines.id',
  created_at DATETIME(3) NULL COMMENT '创建时间，由应用层 GORM 维护',
  updated_at DATETIME(3) NULL COMMENT '更新时间，由应用层 GORM 维护',
  PRIMARY KEY (id),
  UNIQUE KEY idx_api_key_route_overrides_token_slot (token_id, route_slot_id),
  KEY idx_api_key_route_overrides_token_id (token_id),
  KEY idx_api_key_route_overrides_route_slot_id (route_slot_id),
  KEY idx_api_key_route_overrides_route_line_id (route_line_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='API 密钥线路覆盖表：记录某个 API 密钥在某个线路槽位下固定使用哪条线路';
