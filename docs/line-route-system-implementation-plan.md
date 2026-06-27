# 线路系统实施计划

## 目标

在 new-api 的“模型 -> 渠道”之间增加一层可配置的“线路”，实现：

- 用户仍请求原始模型名，例如 `gpt-4o`。
- API Key 可配置“请求模型 -> 线路”的选择策略。
- 系统先按现有模型/分组逻辑找到候选渠道，再按渠道绑定的线路过滤并选择真实渠道。
- 计费按实际命中的线路默认倍率或“渠道 × 线路”绑定覆盖倍率计算。
- 日志记录实际命中的线路、渠道、倍率和回落状态。

第一版只做 `Token` 级线路策略，不做用户默认策略、用户线路权限、priority 调度、健康冷却、风控降级。

当前部署重点按 PostgreSQL 考虑，但实现仍必须保持 SQLite、MySQL、PostgreSQL 三库兼容，这是项目现有约束。PostgreSQL 可以正常使用 `TEXT`、`numeric/decimal`、普通唯一索引和 GORM AutoMigrate；不要把 PostgreSQL-only 能力作为唯一实现路径。

## 阶段 0：计划 Review

创建本文档：

`docs/line-route-system-implementation-plan.md`

确认后再进入代码实现。每个阶段完成后都停下来 review，不连续推进。

### Review 后关键调整

本轮 review 后，第一版实现必须优先遵守这些约束，避免后续编码时偏离现有分发和计费语义：

- route-aware 分发必须在“候选渠道集合”阶段插入线路过滤，不能先调用现有 `GetRandomSatisfiedChannel` 随机得到单个渠道后再判断线路绑定。
- 启用线路策略时，channel affinity 命中的偏好渠道也必须校验线路绑定；不满足策略时应跳过该 affinity 渠道，必要时清除当前 affinity 缓存。
- 线路倍率应同时参与预扣费和最终结算。由于渠道选择发生在 `ModelPriceHelper` 和预扣费之前，第一版不采用“预扣不乘倍率、结算再补差”的方案。
- `channel_route_bindings.ratio_override` 在 Go 模型中应使用指针类型，例如 `*float64`，用 `nil` 明确表示“不覆盖”；非空时必须大于 0。
- `mode = default` 容易与“全局默认线路”混淆。第一版策略模式改为 `mode = fixed` 和 `mode = random`；`fixed` 表示固定选择一条线路，未指定线路时才使用全局默认线路。
- random 策略必须先排除没有可用绑定渠道的线路，再在可用线路之间按权重随机；不能先随机抽中线路再发现无渠道而失败。
- 第一版需要明确定义三类权重语义：`route_policy.lines[].weight` 用于线路之间选择，`channel.weight` 用于同一线路下渠道选择，`channel_route_bindings.weight` 第一版暂不参与调度或只作为后续保留字段。
- 实施范围拆为 V1a/V1b/V1c：先闭环后端分发、计费、日志和测试，再做管理 UI，最后做模型广场线路价格展示。

## 阶段 1：数据模型

新增模型：

- `RouteLine`
- `ChannelRouteBinding`

新增表：

- `route_lines`
- `channel_route_bindings`

修改表：

- `tokens` 增加 `route_policy` 字段，使用 `TEXT` 存 JSON。

### RouteLine

`RouteLine` 表示运营可创建的线路标签，不绑定模型族。它保存一个默认倍率，方便在线路列表和模型广场中展示基础计费倍率；单个渠道绑定这条线路时仍可覆盖倍率。

建议字段：

- `id`
- `code`
- `name`
- `description`
- `ratio`
- `is_default`
- `visible`
- `enabled`
- `sort`
- `remark`
- `created_at`
- `updated_at`

约束和索引：

- `code` 唯一。
- `is_default=true` 的线路第一版只保留一条全局默认线路，由 service 层事务保证：设置某线路为默认时，先将其他线路 `is_default=false`，再将目标线路 `is_default=true`。
- 不使用 PostgreSQL partial unique index 限制默认线路唯一，因为项目仍要兼容 MySQL 和 SQLite。

默认值归一化：

- 创建时若 `code` 为空且是默认线路，归一化为 `default`。
- 创建时若 `ratio <= 0`，归一化为 `1`。
- 创建时显式设置 `visible=true`、`enabled=true`，不要依赖 GORM boolean default tag 表达业务默认值。

### ChannelRouteBinding

`ChannelRouteBinding` 是渠道到线路的绑定表。不同渠道绑定同一条线路时可以配置不同覆盖倍率，例如 GPT 渠道绑定 `default=0.25`，Gemini 渠道绑定 `default=0.35`。如果绑定未设置覆盖倍率，则使用 `route_lines.ratio`。

建议字段：

- `id`
- `channel_id`
- `route_line_id`
- `ratio_override`（Go 字段建议为 `*float64`，`nil` 表示使用线路默认倍率）
- `weight`（第一版保留字段，暂不参与调度；如实现时需要启用，必须先明确它覆盖还是叠加 `channel.weight`）
- `enabled`
- `created_at`
- `updated_at`

第一版暂不做：

- `priority`
- `health_status`
- `cooldown_until`
- `fail_count`
- `success_count`
- `last_error`
- `last_used_at`

这些字段属于健康冷却和高级调度，第一版不实现时不要提前引入，避免产生未使用状态和迁移负担。

约束和索引：

- `channel_id + route_line_id` 唯一，防止同一渠道重复绑定同一线路。
- `channel_id` 建索引。
- `route_line_id` 建索引。
- 不建议加数据库外键。项目现有 `channels`、`abilities`、缓存修复等逻辑主要由应用层维护，继续保持应用层一致性更稳。

默认值归一化：

- 创建时若 `weight <= 0`，归一化为 `10`。
- 创建时显式设置 `enabled=true`。
- 创建时若 `ratio_override` 为空，表示不覆盖，运行时回退到 `route_lines.ratio`。
- 创建或更新时若 `ratio_override` 非空且 `<= 0`，应拒绝保存或在前端提交前清空；后端最终校验必须以“非空必须大于 0”为准。

### Token.route_policy

`tokens.route_policy` 使用 `TEXT`，可为空。

需要同步修改这些后端落点：

- `model.Token` struct 增加 `RoutePolicy string`。
- `Token.Insert()` 允许保存 `route_policy`。
- `Token.Update()` 的 `Select(...)` 必须包含 `route_policy`。
- Token Redis/cache 序列化路径必须包含 `route_policy`。
- `controller.AddToken` 创建时写入 `RoutePolicy`。
- `controller.UpdateToken` 更新时写入 `RoutePolicy`。
- Token 列表和详情返回时带回 `route_policy`。

## 阶段 2：线路策略结构

`token.route_policy` 示例：

```json
{
  "rules": [
    {
      "models": ["gpt-4o", "gpt-*", "o3*"],
      "mode": "random",
      "lines": [
        { "line_id": 1, "weight": 70 },
        { "line_id": 2, "weight": 30 }
      ],
      "allow_default_fallback": true
    }
  ]
}
```

策略按请求模型名匹配，不再按模型族强绑定。第一版模型匹配使用简单字符串规则：

- 精确模型名：`gpt-4o`
- 后缀通配：`gpt-*`
- 前缀通配：`*-preview`
- 全局兜底：`*`

第一版支持：

- `mode = fixed`
- `mode = random`

`fixed` 模式表示固定选择一条线路；如果 `line_id` 为空或显式要求使用默认线路，才解析为全局默认线路。避免再使用 `mode = default`，以免和 `route_lines.is_default` 的“全局默认线路”语义混淆。

权重语义：

- `route_policy.rules[].lines[].weight`：只用于 random 模式下线路之间的选择。
- `channel.weight`：用于命中某条线路后，在该线路绑定的候选渠道中复用现有渠道权重选择。
- `channel_route_bindings.weight`：第一版暂不参与调度；如果实现时决定启用，应明确其优先级，例如“覆盖 `channel.weight`”或“与 `channel.weight` 相乘”，不能隐式叠加。

暂不支持：

- `priority`
- 用户继承策略
- 用户可选线路权限
- 风控覆盖线路

非法或空策略处理：

- JSON 为空：走旧渠道选择逻辑，不强制线路过滤。
- JSON 非法：忽略策略并走旧渠道选择逻辑，同时记录 debug/error 日志。
- 请求模型没有命中任何策略规则：走旧渠道选择逻辑。
- 指定线路不存在、禁用、或在当前请求模型的候选渠道中无可用绑定：按 `allow_default_fallback` 决定是否回落默认线路。
- random 权重为空或全为 0 时使用等权。
- random 模式必须先计算每条策略线路的可用绑定渠道，只在“至少有可用渠道”的线路之间按权重随机；若全部不可用，再按 `allow_default_fallback` 决定回落默认线路或报错。

后端校验：

- `line_id` 必须存在。
- 线路必须 `enabled=true`。
- `mode` 只能是第一版支持的值。
- `models` 不能为空；模型匹配模式只允许精确值、单个 `*` 前缀/后缀通配或 `*` 全局兜底。
- 不允许保存无法解析的 JSON。

## 阶段 3：请求模型匹配

新增 `MatchRoutePolicyRule(modelName string, policy RoutePolicy) *RoutePolicyRule`。

第一版规则：

- 精确匹配优先于通配匹配。
- `gpt-4o` 只匹配同名模型。
- `gpt-*` 匹配以 `gpt-` 开头的模型。
- `*-preview` 匹配以 `-preview` 结尾的模型。
- `*` 作为最后兜底。
- 多条规则同时命中时，使用 `rules` 数组中更靠前的规则。

注意：

- 不要改变请求里的原始模型名。
- 匹配逻辑应大小写不敏感。
- 后续可扩展为正则或模型分组配置，但第一版不引入。

## 阶段 4：渠道选择接入

当前渠道选择入口：

- `service.CacheGetRandomSatisfiedChannel`
- `model.GetRandomSatisfiedChannel`
- `model.GetChannel`
- `middleware.SetupContextForSelectedChannel`
- `controller.getChannel`

改造原则：

- 不替换现有 group/model/priority/weight 逻辑。
- 未配置线路策略时尽量保持旧行为，不强制所有老渠道先补绑定。
- 启用线路策略时，先按现有逻辑得到“支持请求模型的候选渠道”，再按渠道线路绑定过滤。
- 线路策略只缩小候选渠道集合，不负责判断渠道是否支持模型。
- 必须新增“获取候选渠道集合”的内部能力，例如 `GetSatisfiedChannelCandidates(group, model, retry, requestPath)`，并将最终随机选择拆成独立步骤，例如 `PickChannelFromCandidates(candidates)`。
- 不要把 route-aware 逻辑建立在现有 `GetRandomSatisfiedChannel` 的返回结果上；该函数已经完成随机选择，只返回单个渠道，无法正确表达“线路过滤前的候选集合”。
- 如果 channel affinity 先命中偏好渠道，仍必须校验该渠道是否绑定了当前策略命中的线路；不满足时应跳过该 affinity 渠道，继续 route-aware 分发。

### 内存缓存注意点

项目当前渠道选择强依赖 `model/channel_cache.go` 的 `group2model2channels` 内存缓存。

第一版推荐实现：

- 未配置 `route_policy`：继续走现有缓存路径，保持老行为。
- 配置了 `route_policy` 且请求模型命中策略规则：走新增的 route-aware 查询逻辑，先拿到现有候选渠道，再按 `channel_route_bindings` 过滤。
- route-aware 查询可以第一版先走 DB join，确保逻辑正确；后续再优化为扩展内存缓存。
- 即使第一版 route-aware 查询先走 DB，也要确保 `MemoryCacheEnabled=true` 和 `MemoryCacheEnabled=false` 行为一致，不能只改 DB fallback 路径。

不要只改 `model.GetChannel` 的 DB 查询路径，否则在 `MemoryCacheEnabled=true` 时线路策略可能不生效。

### 选择流程

1. 读取请求模型名。
2. 使用现有 group/model/priority/weight 逻辑得到候选渠道。
3. 用请求模型名匹配 `token.route_policy.rules`。
4. 无策略或未命中规则：保持旧渠道选择逻辑。
5. 命中策略后，先为策略中的每条线路计算可用绑定渠道集合。
6. `fixed` 模式选择指定线路；`random` 模式只在有可用绑定渠道的线路之间按策略权重随机。
7. 使用 `channel_route_bindings` 过滤候选渠道，只保留绑定了命中线路且绑定启用的渠道。
8. 在过滤后的渠道集合中复用现有渠道权重语义选择真实渠道。
9. 选择成功后把线路绑定信息写入 context / RelayInfo。
10. 后续请求上游仍复用现有 channel setup 流程。

需要记录：

- selected route line IDs
- dispatch mode
- actual route line ID
- actual route line name
- actual route ratio
- actual channel route binding ID
- ratio source 为 `binding_override` 或 `route_line`
- fallback used

## 阶段 5：计费接入

现有计费来源：

- `relay/helper/price.go`
- `service/text_quota.go`
- `service/quota.go`
- `service/tiered_settle.go`
- `service/task_billing.go`

第一版做法：

- 渠道线路绑定命中后，把 `actual_route_ratio` 写入 `RelayInfo`。
- 预扣费和最终结算都将现有 quota 乘以 `actual_route_ratio`，确保额度校验、日志和最终扣费口径一致。
- `tiered_expr` 的表达式本身不感知线路倍率；线路倍率作为表达式结果后的商品层倍率。
- per-call/task 计费同样乘以线路倍率。
- 建议在 `types.PriceData` 或相邻结构中加入 `RouteRatioInfo`，并在 `BillingSnapshot` 中冻结线路倍率，保证 `tiered_expr` 预扣和结算使用同一条线路倍率。

公式：

```text
actual_quota = existing_quota * actual_route_ratio
```

其中：

```text
actual_route_ratio = channel_route_bindings.ratio_override
                  or route_lines.ratio
                  or 1
```

### 预扣费策略

当前项目是先预扣费，后结算；本方案中实际线路在渠道选择完成后、`ModelPriceHelper` 和预扣费之前已经确定。

第一版推荐：

- 预扣费按已命中的实际线路倍率计算：`pre_consume_quota = existing_pre_consume_quota * actual_route_ratio`。
- 请求成功后结算阶段继续按同一实际线路倍率计算，发生 usage 差异时沿用现有多退少补机制。
- `tiered_expr` 预扣时应把线路倍率作为表达式结果后的商品层倍率写入快照；结算时复用快照中的倍率，不重新解析策略。
- 只有在未来支持“先预扣、后选线路”的新流程时，才需要考虑“按策略最大倍率预扣费”。

## 阶段 6：日志接入

不新增 `logs` 表物理列，避免 ClickHouse 和多数据库迁移风险。

写入 `logs.other`：

```json
{
  "route": {
    "request_model": "gpt-4o",
    "selected_route_lines": [1, 2],
    "dispatch_mode": "random",
    "actual_route_line_id": 2,
    "actual_route_line_name": "稳定线路",
    "actual_channel_route_binding_id": 18,
    "actual_ratio": 0.35,
    "ratio_source": "binding_override",
    "fallback_used": false
  }
}
```

错误日志也尽量附带线路信息，方便排查无可用渠道、回落、倍率异常。

## 阶段 7：后台接口

新增管理员接口：

- 查询线路列表
- 创建线路
- 编辑线路
- 启用/禁用线路
- 设置默认线路
- 查询渠道线路绑定
- 保存渠道线路绑定

Token 接口：

- 创建 Token 时接受 `route_policy`
- 更新 Token 时接受 `route_policy`
- 返回 Token 时返回 `route_policy`

Pricing 接口：

- `/api/pricing` 在现有响应基础上增加线路价格信息。
- 返回字段保持向后兼容，旧字段不改名、不删除。
- 每个模型可选增加 `route_prices`，用于模型广场展示不同线路价格。

后端校验：

- `line_id` 必须存在。
- 线路必须 enabled。
- `route_lines.ratio` 必须大于 0。
- `channel_route_bindings.ratio_override` 为空表示使用线路默认倍率；非空时必须大于 0。
- 保存渠道绑定时，`channel_id + route_line_id` 不允许重复。
- Token 策略中的 `models` 匹配规则必须合法。
- random 权重为空时使用等权。
- 所有错误返回可本地化 message。

## 阶段 8：前端最小页面

第一版只做必要配置 UI：

- 线路管理页。
- 渠道编辑页增加线路绑定区域。
- API Key 创建/编辑页增加线路策略配置。

### 页面边界

先定页面，再写前端实现。线路系统会影响“全局线路标签”、“渠道绑定线路并定价”、“Token 怎么选择线路”三类配置，第一版页面按这三个边界拆开：

1. `系统设置 -> 计费与支付 -> Route Lines`：管理 `route_lines`，定义线路标签、用户说明和默认倍率。
2. `渠道编辑` 抽屉：管理当前渠道的 `channel_route_bindings`，这里可覆盖线路倍率。
3. `API Key 创建/编辑` 抽屉：只管理当前 Token 的 `route_policy`。

不建议把所有线路配置塞进渠道编辑或 API Key 编辑抽屉。现有 `web/default/src/features/channels/components/drawers/channel-mutate-drawer.tsx` 和 `web/default/src/features/keys/components/api-keys-mutate-drawer.tsx` 已经承担较多配置项，线路主数据应有独立页面，两个抽屉只做引用和绑定。

### 线路管理页

位置建议：

- 放在 `系统设置 -> 计费与支付` 分组下，作为 `Model Pricing` 和 `Group Pricing` 之间的新 section：`Route Lines`。
- 如果后续线路会成为高频运营配置，再提升为左侧导航独立菜单。

页面能力：

- 创建线路。
- 编辑线路名称、code、用户可见说明、默认倍率、排序、备注。
- 启用/禁用线路。
- 设置全局默认线路。
- 显示默认线路标记。
- 显示线路是否可见。第一版 `visible` 主要保留给后续用户侧展示，后台仍可编辑。
- 显示当前线路绑定的渠道概览，方便知道这条线路实际由哪些渠道承载。
- 线路列表显示默认倍率；如果某个渠道绑定覆盖倍率，最终计费以绑定覆盖倍率为准。

表格字段：

- 线路名称 `name`
- 线路编码 `code`
- 用户可见说明 `description`
- 默认倍率 `ratio`
- 绑定渠道
- 默认线路 `is_default`
- 可见 `visible`
- 状态 `enabled`
- 排序 `sort`
- 备注 `remark`
- 操作

创建/编辑表单规则：

- `code` 必填，全局唯一；默认线路建议使用 `default`。
- `name` 必填。
- `description` 用于模型广场或用户侧线路说明，例如“GPT 稳定线路，官方不倒我不倒”。
- `ratio` 为线路默认倍率，例如 `1`、`1.5`、`0.8`；渠道绑定未覆盖倍率时使用该值计费。
- `is_default` 使用开关；打开后后端负责只保留一个全局默认线路。
- `visible`、`enabled` 使用开关。
- `remark` 使用多行文本。

第一版不做：

- 线路健康状态。
- 线路成功率/失败率统计。
- 冷却倒计时。
- 线路维度报表。

### 渠道编辑：线路绑定区域

位置建议：

- 放在渠道编辑抽屉的“高级设置”附近，但不要混进 JSON 编辑器。
- 仅编辑当前渠道绑定到哪些线路，不负责创建线路。

区域能力：

- 展示所有可用线路。
- 勾选当前渠道绑定的线路。
- 为每条绑定配置可选 `ratio_override`，例如 GPT 渠道覆盖默认线路为 `0.25`，Gemini 渠道覆盖默认线路为 `0.35`。
- 为每条绑定配置 `weight`。
- 第一版 `weight` 仅作为预留配置展示；如果后端暂不参与调度，前端文案需避免让管理员误以为它会改变当前流量分布。
- 启用/禁用单条绑定。

交互规则：

- 默认不强制绑定。未配置 Token 线路策略时，老渠道选择逻辑保持不变。
- 当管理员给某 Token 配置线路策略后，只有绑定到命中线路的渠道才参与选择。
- `ratio_override` 为空表示使用线路默认倍率；小于等于 0 时提交前清空或提示错误。
- `weight` 为空或小于等于 0 时提交前归一化为 10。
- 模型可用性仍以后端现有 group/model/ability 逻辑为准，线路绑定不表示渠道支持某个模型。

第一版不做：

- 在渠道页创建新线路。
- 在渠道页批量绑定所有渠道。
- 绑定健康状态、冷却、失败率。

### API Key 创建/编辑：线路策略区域

位置建议：

- 放在 API Key 抽屉的高级配置中。
- 默认折叠，避免普通用户创建 Key 时被复杂策略打扰。

区域能力：

- 按请求模型匹配规则配置策略。
- 每条规则支持 `mode = fixed` 和 `mode = random`。
- `fixed` 模式：选择一条线路，或使用全局默认线路。
- `random` 模式：选择多条线路并配置权重。
- 配置 `allow_default_fallback`。
- 提供 JSON 预览，但第一版不要求用户直接写 JSON。

推荐 UI：

- 规则列表，每条规则包含模型匹配输入，例如 `gpt-4o`、`gpt-*`、`*`。
- 每条规则内使用分段控件选择 `fixed` / `random`。
- `random` 下使用可增删的线路行：线路下拉 + 权重数字输入。
- `allow_default_fallback` 使用开关。
- 底部显示只读 JSON 预览，便于管理员确认最终写入 `route_policy` 的结构。

提交规则：

- 没有配置任何规则时，`route_policy` 提交为空字符串或空 JSON，由后端走旧逻辑。
- 只提交用户实际配置过的规则，避免生成大量空策略。
- 前端做基础校验，后端仍做最终校验。
- 保存后详情接口返回 `route_policy`，编辑时从后端值反填 UI。

第一版不做：

- 用户可选线路权限。
- 根据用户组自动推荐线路。
- 风控降级配置。
- priority 策略 UI。
- 线路测试按钮。

前端规则：

- 使用 `useTranslation()`。
- 所有新增文案写入 `web/default/src/i18n/locales/{en,zh,fr,ja,ru,vi}.json`。
- 使用 Bun：`bun run i18n:sync`、`bun run typecheck`、lint。
- 不做复杂权限 UI，不做风控 UI。

## 阶段 9：模型广场线路价格展示

模型广场展示建议作为 V1c 独立推进。V1a 先完成后端分发、计费、日志和测试闭环；V1b 完成线路管理、渠道绑定和 Token 策略 UI；V1c 再补充模型广场线路价格展示。这样可以先验证真实请求链路，再处理展示层复杂度。

线路倍率会影响最终计费，所以模型广场不能继续只展示单一模型价格。第一版采用“卡片起价 + 详情页明细表”的方式：

- 模型卡片显示可见线路中的最低价，并标记存在多线路价格。
- 模型详情页展示不同线路的价格明细。
- 只展示 `visible=true` 且 `enabled=true` 的线路。
- 不按 API Key 的 `route_policy` 做个性化价格展示。

### 后端响应结构

`/api/pricing` 在每个 `PricingModel` 上增加：

- `route_prices`

`route_prices` 每项包含：

- `route_line_id`
- `code`
- `name`
- `is_default`
- `ratio_min`
- `ratio_max`
- `binding_count`
- `available`

示例：

```json
{
  "model_name": "gpt-4o",
  "route_prices": [
    {
      "route_line_id": 1,
      "code": "default",
      "name": "默认线路",
      "is_default": true,
      "ratio_min": 0.25,
      "ratio_max": 0.35,
      "binding_count": 2,
      "available": true
    },
    {
      "route_line_id": 2,
      "code": "stable",
      "name": "稳定线路",
      "is_default": false,
      "ratio_min": 0.6,
      "ratio_max": 0.6,
      "binding_count": 1,
      "available": true
    }
  ]
}
```

### 后端计算规则

- 对每个模型，先复用现有模型广场能力集合，找到支持该模型且用户可见的渠道。
- 再聚合这些渠道启用的 `channel_route_bindings`。
- 只返回 `route_lines.visible=true`、`route_lines.enabled=true`、`channel_route_bindings.enabled=true` 的线路。
- 无绑定渠道的线路不展示。
- 可用绑定渠道必须同时满足现有模型广场的模型、分组、渠道可用性判断，不能绕过现有 `ability` / `channel` 语义。
- `ratio_min` / `ratio_max` 来自命中绑定的有效倍率：`channel_route_bindings.ratio_override` 优先，否则使用 `route_lines.ratio`。
- 同一线路下多个渠道绑定倍率不同时，返回倍率区间。
- 若绑定覆盖倍率为空，使用线路默认倍率；若线路默认倍率为空或小于等于 0，后端归一化为 `1`。
- 未配置线路或无可展示线路时，`route_prices` 为空或省略，前端保持旧展示。

### 前端价格规则

现有模型广场价格来源包括：

- `web/default/src/features/pricing/types.ts`
- `web/default/src/features/pricing/lib/price.ts`
- `web/default/src/features/pricing/components/model-card.tsx`
- `web/default/src/features/pricing/components/model-details.tsx`

第一版在这些现有计算基础上乘线路倍率：

- token 模型：`现有价格 × route_ratio`
- per-request 模型：`现有请求价格 × route_ratio`
- `tiered_expr`：表达式结果后再乘线路倍率。

当 `ratio_min == ratio_max` 时，显示单价；当 `ratio_min != ratio_max` 时，显示价格区间。

### 模型卡片展示

- 卡片仍保持紧凑，不铺开所有线路。
- 有线路价格时，卡片显示最低可见线路价。
- 多线路时增加 `From` / `Route prices` 类提示。
- 无线路价格时，完全保持现有价格展示。

### 模型详情页展示

新增 `Pricing by Route Line` 区块。

表格字段：

- 线路
- 倍率
- Input
- Output
- Cache
- Cache Write
- Image
- Audio In
- Audio Out
- Price（per-request 模型）

展示规则：

- token 模型显示 Input / Output 以及该模型支持的扩展价格列。
- per-request 模型只显示请求价格。
- 动态计费模型先按现有动态计费逻辑得到表达式结果，再按线路倍率生成线路价格。
- 线路倍率为区间时，所有价格列都显示区间。
- 继续保留现有 `Pricing by Group`，线路价格是新增维度，不替换 group ratio 展示。

### i18n

新增所有用户可见文案到：

- `web/default/src/i18n/locales/en.json`
- `web/default/src/i18n/locales/zh.json`
- `web/default/src/i18n/locales/fr.json`
- `web/default/src/i18n/locales/ja.json`
- `web/default/src/i18n/locales/ru.json`
- `web/default/src/i18n/locales/vi.json`

实现后运行：

```bash
cd web/default
bun run i18n:sync
bun run typecheck
```

## 测试计划

后端测试：

- route_policy 模型匹配。
- route_policy 解析。
- 空策略走旧渠道选择逻辑。
- random 多线路按权重选择。
- 指定线路不可用时 fallback default。
- 无可用渠道时返回明确错误。
- 倍率来源优先级：channel_route_bindings.ratio_override > route_lines.ratio > 1。
- 线路倍率参与 ratio 计费。
- 线路倍率参与 `tiered_expr` 结算结果。
- 日志 `other.route` 写入完整信息。
- `MemoryCacheEnabled=true` 和 `MemoryCacheEnabled=false` 下线路策略行为一致。
- `/api/pricing` 未配置线路时保持旧响应可用。
- `/api/pricing` 只返回 `visible=true && enabled=true` 的线路价格。
- `/api/pricing` 不展示无可用绑定渠道的线路。
- `/api/pricing` 按支持模型的渠道绑定聚合线路价格。
- `/api/pricing` 中同一线路多渠道绑定倍率不同时返回倍率区间。

数据库验证：

- SQLite AutoMigrate。
- MySQL AutoMigrate。
- PostgreSQL AutoMigrate。
- `tokens.route_policy` 为文本列，可为空。
- `route_lines.code` 唯一约束生效。
- `channel_route_bindings.channel_id + route_line_id` 唯一约束生效。

前端验证：

- `bun run i18n:sync`
- `bun run typecheck`
- lint 涉及文件
- 模型广场无线路价格时保持旧展示。
- 模型卡片显示最低线路价。
- 模型详情页显示完整线路价格表。
- 倍率区间显示为价格区间。
- 手动创建线路、绑定渠道、创建 Token、发起请求并查看日志。

## 明确延期项

第一版不做：

- `user.route_policy`
- `users.allowed_route_lines`
- priority 调度模式
- 自动冷却
- 自动禁用
- 失败率保护
- 风控中心线路降级
- 线路统计报表
- 独立线路日志表
- route-aware 内存缓存优化

## Review 检查点

每阶段完成后检查：

1. 是否破坏未配置线路的旧 Token 行为。
2. 是否保持 SQLite/MySQL/PostgreSQL 兼容，尤其 PostgreSQL 下 AutoMigrate 是否稳定。
3. 是否影响现有 group/model ratio。
4. 是否影响 `tiered_expr` 表达式计费契约。
5. 是否有足够日志排查真实命中的线路和倍率。
6. 是否所有用户可见文案完成 i18n。
7. `MemoryCacheEnabled=true` 时线路策略是否仍然生效。
