# 指数筛选页（/index-screener）UI 设计

> 范围：旧版 Web 应用（`frontend/` + `backend/`，`http://localhost:8901`）。
> 参考：`/etf-screener`（筛选页交互与视觉基准）、`/stock-screener`。
> 数据来源：tushare `index_basic` + `index_daily` + `sw_daily` + `etf_basic` + `etf_share_size`。
> 原则：只呈现客观数据与筛选结果，不出现建仓/加减仓/目标价/止损位等投资动作建议；派生金额/比率经 `calc/` 或后端归一。
> 状态：**已实现**（`/index-screener`；后端 `/api/index/screener/snapshot`）。

---

## 一、定位

「指数筛选」= 国内指数全量目录的条件过滤 + 排序 + 导出，并回答两个高频问题：

1. 这个指数是**什么类型、谁发布、何时发布**（基础档案）；
2. 这个指数**有没有 ETF 跟踪、合计规模多大**（可投资性线索），以及**最新点位/涨跌幅**。

### 1.1 数据范围（已实测）

| 数据 | 接口 | 覆盖 | 说明 |
|---|---|---|---|
| 指数基础信息 | `index_basic` | 11,848 条 | 市场：CSI 9,057 / CNI 1,146 / SW 950 / SZSE 485 / SSE 208 / BSE 2 |
| 指数日线 | `index_daily(trade_date)` | 9,323 条/日 | 最新交易日收盘、涨跌幅；覆盖 CSI/CNI/SH/SZ/BJ 等 |
| 申万日线 | `sw_daily(trade_date)` | 439 条/日 | 补 SW 指数的收盘/涨跌幅（另有 PE/PB，本期不用） |
| ETF 跟踪 | `etf_basic` + `etf_share_size` | 1,717 只 ETF | 按 `index_code` 聚合：跟踪 ETF 数 + 合计规模（T-1） |

> `index_daily` 单次按交易日返回约 9 千行，已覆盖大多数指数；SW 用 `sw_daily` 补齐。仍无行情的指数（约 1–2 千条，多为新发布/长期无成交/终止指数）行情列显示「—」。
>
> `index_type`（指数风格）在当前 tushare 数据中全部为空，因此不提供该筛选项，避免出现只有「未分类」的无效条件。

### 1.2 本期不做

- 指数历史 K 线、估值分位（PE/PB）、成分股穿透。
- 指数详情页（后续可另开 `/index-data`）。
- 盘中实时点位（当前用最近交易日收盘；`index_daily` 为日频）。
- 全收益/净收益指数的收益口径拆分。

---

## 二、页面布局

### 2.1 路由与导航

- 新路由 `/index-screener`，侧边栏「指数筛选」放在「ETF 筛选」正下方。
- 容器宽度与 `/etf-screener` 一致：`max-w-[1600px]`。

### 2.2 线框图

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ 指数筛选                                                                                     │
│ 国内指数全量目录 · 行情 · ETF 跟踪 · 数据仅作客观呈现，不构成投资建议                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 筛选条件                                                              已选 3 项   [收起 ▾]  │
│ ┌─ 市场 / 类别 ───────────┐ ┌─ 发布方 ──────────────┐ ┌─ 发布日期 ─────────┐ ┌─ ETF 跟踪 ────┐│
│ │ 市场 ☑中证 ☑国证 ☑申万  │ │ [中证指数 ×]           │ │ [    ] – [    ]    │ │ ☑仅看有 ETF   ││
│ │      ☑沪 ☑深 ☑北交所     │ │ 搜索发布方…            │ │ 快捷: 近1年/近3年  │ │ ETF数 [ ]–[ ] ││
│ │ 类别 ☑规模 ☑主题 ☑行业  │ │                        │ │                    │ │ 规模(亿)[ ]–[ ]││
│ │      ☑债券 ☑策略 …       │ │                        │ │                    │ │               ││
│ └─────────────────────────┘ └────────────────────────┘ └────────────────────┘ └───────────────┘│
│ ┌─ 行情 / 搜索 ────────────────────────────────────────────────────────────────────────────┐ │
│ │ 名称/代码 [        ]   涨跌幅% [ ]–[ ]   ☐仅有行情           状态 ☑存续 ☑终止             │ │
│ └──────────────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                        [重置]  [开始筛选]   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 命中 2,136 条 · 行情日 2026-10-23 · ETF规模 2026-10-23 · 无行情 2,525 条  [列设置] [导出] [刷新]│
│ 代码/名称              市场  类别    发布方   最新点位  涨跌%   发布日     ETF数  规模(亿) 状态│
│ 000300.SH 沪深300      SSE  规模指数 中证     4,152.11  -0.54   2005-04-08  24    4,231.5  存续│
│ 000905.SH 中证500      SSE  规模指数 中证     6,102.33  +0.82   2007-01-15  18    1,845.2  存续│
│ …                                                                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [1] 2 3 4 … 43   每页 [50 ▾]                    免责声明：不荐股 · 不预测 · 无倾向             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

- 上下布局与 ETF 筛选一致：条件在上、结果在下；条件区可收起为一行摘要。
- 结果表是唯一主滚动区；窄屏横向滚动。

### 2.3 区块职责

| 区块 | 组件 | 职责 |
|---|---|---|
| A 页头 | `PageHeader` | 标题、副标题 |
| B 条件区 | `IndexScreenerFilters` | 5 张条件卡 + 重置/开始筛选 |
| C 工具条 | `IndexScreenerToolbar` | 命中数、行情日、ETF 规模日、无行情数、列设置、导出、刷新 |
| D 结果表 | `IndexScreenerTable` | 可排序、分页、市场/类别标签 |
| E 页脚 | `Disclaimer` | 合规声明 |

---

## 三、筛选条件

| 卡片 | 控件 | 字段 | 默认 |
|---|---|---|---|
| 市场 / 类别 | 多选 | 市场：CSI / CNI / SW / SSE / SZSE / BSE；类别：规模 / 主题 / 行业 / 债券 / 策略 / 风格 / 多资产 / 基金 / 期货 / 综合 / 其他 / 外汇 | 全选 |
| 发布方 | 搜索多选 | `publisher`（中证指数、深证信息、申万等） | 空 = 全部 |
| 发布日期 | 双输入 + 快捷档位 | `list_date`；快捷：近 1 年 / 近 3 年 | 空 = 不限 |
| ETF 跟踪 | 开关 + 区间 | 「仅看有 ETF」；`etf_count` 区间；`etf_size_yi` 区间 | 关；空 = 不限 |
| 行情 / 搜索 | 双输入 + 开关 + 文本 | 名称/代码包含搜索；涨跌幅区间；「仅有行情」；状态：存续 / 终止 | 空；空；关；两者都勾选 |

- 「开始筛选」才应用草稿；重置回默认并立即重筛；筛选区不自动收起。
- 市场全不选按「全选」处理；类别同理。
- 发布日期输入 `YYYYMMDD` 或 `YYYY-MM-DD`，前端统一转 `YYYYMMDD` 比较。
- 状态：`exp_date` 非空且 ≤ 今天 → 终止；否则存续。

---

## 四、结果表

### 4.1 默认列（10 列）

| 列 | 字段 | 来源 | 说明 |
|---|---|---|---|
| 代码 / 名称 | `code` / `name` | `index_basic` | 代码等宽；名称 `font-medium`；全称 `title` |
| 市场 | `market` | `index_basic` | 显示中文标签（中证/国证/申万/沪/深/北交所） |
| 类别 | `category` | `index_basic` | 中性 tag |
| 发布方 | `publisher` | `index_basic` | 过长省略，`title` 显示全称 |
| 最新点位 | `close` | `index_daily` / `sw_daily` | 最近交易日收盘；缺失「—」 |
| 涨跌% | `pct_chg` | 同上 | 红涨绿跌；缺失「—」 |
| 发布日 | `list_date` | `index_basic` | `YYYY-MM-DD` |
| 跟踪 ETF 数 | `etf_count` | ETF 聚合 | 无跟踪 = 0 |
| 合计规模(亿) | `etf_size_yi` | `etf_share_size` T-1 | 无跟踪/规模缺失 = 0 或「—」 |
| 状态 | `status` | 计算 | 存续 / 终止 |

- 默认排序：`etf_size_yi` 降序；缺失/0 沉底，再按 `list_date` 降序。
- 可排序列：最新点位、涨跌%、发布日、ETF 数、规模。
- 列设置与导出 CSV 与 ETF 筛选一致；偏好键 `vr-index-screener-columns`。

### 4.2 行内交互

- 本期不加行内跳转（指数详情页未建）；点击代码复制到剪贴板，`toast` 提示「已复制」。
- 不提供「买入/卖出/目标价」等动作。

---

## 五、数据口径与降级

### 5.1 聚合口径

- **跟踪 ETF 数**：`etf_basic.list_status='L'` 中 `index_code` 等于该指数 `ts_code` 的 ETF 数量。
- **合计规模**：上述 ETF 在最新 `etf_share_size.trade_date` 的 `total_size`（万元）之和 ÷ 10000 → 亿元；规模缺失的 ETF 计数仍计入，规模不补 0 参与求和（跳过并记录缺失数）。
- **行情**：`index_daily` 优先；SW 指数用 `sw_daily` 的 `pct_change`（字段名不同，后端归一为 `pct_chg`）。
- **ETF 规模日** 与 **行情日** 独立返回，UI 分别标注。

### 5.2 降级（必须出声）

| 情况 | 表现 |
|---|---|
| 未配置 `TUSHARE_TOKEN` | 页面错误态：「指数筛选需要配置 TUSHARE_TOKEN」；不展示空表 |
| `index_basic` 积分不足/超时 | 502 + 原因；保留旧缓存时标 `stale` |
| `index_daily` 无最新日数据 | 自动回退最多 7 个自然日；工具条标注实际行情日 |
| 部分指数无行情 | 行情列「—」；工具条显示「无行情 N 条」；「仅有行情」可过滤 |
| ETF 规模缺失 | 合计规模按可得部分求和，工具条标注「规模缺失 N 只」 |
| ETF 聚合失败 | ETF 列显示「—」，指数目录与行情照常；状态条可重试 |

---

## 六、后端接口

```
GET /api/index/screener/snapshot?refresh=1
```

返回列式 JSON（与 ETF/股票快照同构）：

```jsonc
{
  "as_of": "2026-10-24T15:00:00+08:00",
  "quote_date": "2026-10-23",
  "etf_size_date": "2026-10-23",
  "count": 11848,
  "no_quote": 2525,
  "etf_size_missing": 71,
  "stale": false,
  "fields": ["code","name","fullname","market","publisher","category","index_type",
             "base_date","base_point","list_date","exp_date","close","pct_chg",
             "etf_count","etf_size_yi","status"],
  "rows": [["000300.SH","沪深300","沪深300指数","SSE","中证指数有限公司","规模指数","",
            "20041231",1000,"20050408","",4152.1076,-0.5372,24,4231.5,"存续"], …]
}
```

- 缓存：`index_basic` 12h；`index_daily`/`sw_daily` 30min；ETF 聚合 30min；整体快照 30min。
- `index_basic` 单次上限 8000，后端按「CSI 分类 + 其它市场」分批抓取并去重；分批间隔 ≥0.55s，避免触发 120 次/分限频。
- `refresh=1` 强制重取行情与 ETF 规模；基础表仍走 12h 缓存。
- 错误码：无 token → 503；积分/权限不足 → 502；无数据 → 200 + 空数组。

### 6.1 文件变更

| 文件 | 变更 |
|---|---|
| `backend/astock.py` | `index_basic_all()` / `index_daily_latest()` / `sw_daily_latest()` / `etf_index_stats()` / `index_screener_build()` |
| `backend/app.py` | `GET /api/index/screener/snapshot`（TTL + stale-while-revalidate） |
| `frontend/src/lib/api.ts` | `IndexScreenerSnapshot` 类型与 `api.indexScreenerSnapshot()` |
| `frontend/src/lib/index-screener.ts` | 解码 / 条件 / 过滤 / 排序 / 列定义 / CSV |
| `frontend/src/components/index-screener/` | `IndexScreenerFilters.tsx` / `IndexScreenerToolbar.tsx` / `IndexScreenerTable.tsx` |
| `frontend/src/pages/IndexScreener.tsx` | 页面主组件 |
| `frontend/src/router.tsx` | 新增 `/index-screener` |
| `frontend/src/components/layout/Layout.tsx` | 导航新增「指数筛选」，容器放宽 |

---

## 七、视觉规范

- 完全复用 `/etf-screener`：`PageHeader`、`GlassCard`、条件卡、chips、按钮、表头、分页、免责声明。
- 市场标签用中性灰；类别标签中性灰；终止状态用 `text-warning`；涨跌红/绿。
- 数字列 `font-mono tabular-nums` 右对齐；规模保留 2 位小数；点位保留 2 位小数。
- 缺失值统一「—」，不用 0 冒充；规模 0 与缺失区分：无跟踪 ETF 显示 0，规模不可得显示「—」。
- 响应式与 ETF 筛选一致：≥1440 四卡一行，1024–1440 两卡一行，<1024 单列。

---

## 八、验收清单

1. `/index-screener` 可加载全量指数（≈11,848 条），默认按 ETF 合计规模降序。
2. 市场/类别/发布方/发布日/ETF 跟踪/规模/涨跌幅/状态/名称搜索可组合生效。
3. 工具条显示命中数、行情日、ETF 规模日、无行情数、规模缺失数；过期或失败可见。
4. 无 token 时错误态明确；部分指数无行情时显示「—」且可过滤，不影响其他行。
5. 跟踪 ETF 数与合计规模按 `index_code` 聚合，规模口径为 T-1 万元→亿元。
6. 排序、分页、列设置、CSV 导出一致；刷新后状态保留。
7. 全页无投资动作建议；不展示「高估/低估」判断。

---

## 九、相关文件索引

- `docs/ui-design/etf-screener-page-ui-design.md`：交互与视觉基准
- `docs/ui-design/stock-screener-page-design.md`：筛选页原始设计
- `frontend/src/pages/IndexScreener.tsx`：新增页面
- `frontend/src/components/index-screener/`：新增组件
- `frontend/src/lib/index-screener.ts`：纯逻辑
- `backend/astock.py` / `backend/app.py`：取数与接口
- `tushare-data/references/数据接口.md`：`index_basic` / `index_daily` / `sw_daily` / `etf_basic` / `etf_share_size`
