# ETF 筛选页（/etf-screener）页面布局设计

> 范围：旧版 Web 应用（`frontend/` + `backend/`，`http://localhost:8901`）。
> 需求：股票筛选页已存在（`/screener`），本次新增**独立的 ETF 筛选页**，侧边栏入口放在「股票筛选」下方。
> 数据来源：**只使用 `tushare-data` 登记的接口** —— `etf_basic`（ETF 基础信息）、`fund_basic`（基金类型）、`etf_share_size`（每日份额/规模/净值）、`fund_daily`（ETF 日线）。不接入腾讯/东财行情。
> 原则：只呈现客观数据与筛选结果；不出现建仓/加减仓/目标价/止损位等任何投资动作建议；派生比率/倍数经 `calc/` 计算，后端归一，前端不手搓公式。
> 状态：**本文只做布局与实现设计，未改动任何代码。**

---

## 一、定位与口径

「ETF 筛选」= 给场内 ETF 做**条件过滤 + 排序 + 导出**的独立工作台，与「股票筛选」并列但互不影响：

- 独立路由 `/etf-screener`，独立数据接口、独立条件与结果表；不改动现有股票筛选页。
- 数据宇宙 = `etf_basic(list_status='L')` 的上市中 ETF（当前约 1,717 只），不含已退市（D）与待上市（P）。
- **本页是盘后日频筛选，不是盘中实时**：`etf_share_size` 于次日 8:30 左右更新上一交易日数据，`fund_daily` 同为收盘后数据；页面所有行情、规模、折溢价统一为同一交易日（T-1），工具条显式标注数据日期。
- 盘中实时（`rt_etf_k`）需单独开通权限，本期不接入；后续可在不改布局的前提下增加「实时/日频」切换。

### 1.1 为什么不复用股票快照

- 股票快照后端按 `security_type` 只保留 `GP*`，ETF 已被剔除。
- ETF 没有 PE/PB/ROE/行业，股票估值与行业条件不适用；ETF 核心维度是**规模、费率、跟踪指数、管理人、类型、折溢价、流动性**。
- ETF 规模是每日盘后口径（万元），与股票实时总市值不同源、不同频率，不能混排。

### 1.2 本期不做

- 盘中实时行情（依赖 `rt_etf_k` 权限）。
- ETF 详情页、K 线、成分股穿透、历史规模曲线。
- 折溢价的历史分位与「高估/低估」判断。

---

## 二、导航与页面结构

### 2.1 侧边栏入口

现有顺序（`frontend/src/components/layout/Layout.tsx`）：`… 自选股 → 我的持仓 → 我的研报 …`，其中「股票筛选」紧随「自选股」。本次在其**正下方**插入：

```ts
{ to: "/etf-screener", icon: Boxes, label: "ETF 筛选" },
```

- 图标：`lucide-react` 的 `Boxes`（一篮子标的的语义），与股票筛选的 `SlidersHorizontal` 区分。
- 路由：`frontend/src/router.tsx` 增加 `{ path: "/etf-screener", element: <EtfScreener /> }`。
- 折叠态沿用现有 `title` 悬浮提示。

### 2.2 页面版式

沿用股票筛选页的**上下布局**：上半屏条件区、下半屏结果表，单列自上而下；结果表列较多，容器宽度按路由放宽到 `max-w-[1600px]`（与 `/screener` 同一处理）。

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ ETF 筛选                                                                                     │
│ 场内 ETF 条件过滤 · 盘后日频（T-1）· 数据仅作客观呈现，不构成投资建议                          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 筛选条件                                                              已选 3 项   [收起 ▾]  │
│ ┌─ 交易所 / 类型 ─────────┐ ┌─ 跟踪指数 ───────────┐ ┌─ 管理人 ─────────┐ ┌─ 规模(亿) ────┐ │
│ │ 交易所 ☑沪 ☑深          │ │ [沪深300 ×][科创50 ×]│ │ [华夏基金 ×]      │ │ [    ]–[    ] │ │
│ │ 类型 ☑股票 ☑债券 ☑货币  │ │ 搜索指数…            │ │ 搜索管理人…       │ │ ≤10 10–50     │ │
│ │      ☑混合 ☑其他        │ │ [选择跟踪指数 ▾]     │ │ [选择管理人 ▾]    │ │ 50–100 100–300│ │
│ │ 跨境 ☐仅QDII            │ │                      │ │                   │ │ ≥300          │ │
│ └─────────────────────────┘ └──────────────────────┘ └───────────────────┘ └───────────────┘ │
│ ┌─ 管理费率(%) ───────────┐ ┌─ 行情（同一交易日） ───────────────────────────────────────┐ │
│ │ [    ]–[    ]           │ │ 涨跌幅% [ ][ ]   成交额(亿) [ ][ ]   换手率%(T-1) [ ][ ]   │ │
│ │ ≤0.15  0.15–0.50  ≥0.50 │ │ 折溢价%(T-1) [ ][ ]   ☑排除无报价                          │ │
│ └─────────────────────────┘ └────────────────────────────────────────────────────────────┘ │
│                                                                        [重置]  [开始筛选]   │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 命中 236 只 · 数据日 2026-10-23 · 规模缺失 71 只 · tushare 盘后  [列设置▾] [导出 CSV] [刷新] │
│ 代码/简称          收盘价  涨跌%   成交额(亿) 换手%(T-1) 规模(亿) 折溢价% 跟踪指数  管理人   │
│ 510300 沪深300ETF  4.178   -0.35   18.32     0.42       1,473.5  +0.12   沪深300   华泰柏瑞 │
│ 588000 科创50ETF   …                                                                         │
│ …                                                                                            │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ [1] 2 3 4 … 5   每页 [50 ▾]                    免责声明：不荐股 · 不预测 · 无倾向             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 三、筛选条件设计

### 3.1 条件卡片

| 卡片 | 控件 | 字段 / 取值 | 默认 |
|---|---|---|---|
| 交易所 / 类型 | 交易所复选 + 类型复选 + 「仅跨境 QDII」开关 | 交易所：沪（SH）/ 深（SZ）；类型：股票型 / 债券型 / 货币型 / 混合型 / 其他（`fund_basic.fund_type`）；QDII（`etf_basic.etf_type`） | 沪深全选；类型全选；QDII 关 |
| 跟踪指数 | 搜索 + 多选（已选 chip ×） | `etf_basic.index_name`；空值归入「无跟踪指数」 | 空 = 全部 |
| 管理人 | 搜索 + 多选 | `etf_basic.mgr_name` | 空 = 全部 |
| 规模（亿元） | 双输入 + 5 档 chips | `etf_share_size.total_size ÷ 10000`（T-1） | 空 = 不限 |
| 管理费率（%/年） | 双输入 + 3 档 chips | `etf_basic.mgt_fee`（原值即百分比） | 空 = 不限 |
| 行情（整行） | 4 组双输入 + 排除开关 | 涨跌幅%（`fund_daily.pct_chg`）、成交额（亿元）、换手率%（T-1）、折溢价%（T-1）；「排除无报价」默认开 | 空 = 不限 |

- 规模档位：`≤10 / 10–50 / 50–100 / 100–300 / ≥300`（亿元）。ETF 规模分布与股票不同，不套用股票档位。
- 费率档位：`≤0.15 / 0.15–0.50 / ≥0.50`（%/年）。
- 折溢价档位（可选）：`≤-0.5 / -0.5–0.5 / ≥0.5`（%），用于快速看折价/溢价区间；默认不选。
- 交互与股票筛选一致：条件写入 `draft`，点「开始筛选」才应用；「重置」回默认并立即重筛；「开始筛选」后结果表滚到视口顶部，筛选区不自动收起。
- 收起态显示已选条件摘要（中性 chip），状态存 `localStorage: vr-etf-screener-collapsed`，默认展开。

### 3.2 条件语义

| 条件 | 语义 |
|---|---|
| 交易所 | SH / SZ 多选，全不选视为全选（前端阻止空选） |
| 类型 | 多选；`fund_type` 缺失的 ETF 归入「其他」 |
| 仅跨境 QDII | 开启后只保留 `etf_type == "QDII"`；关闭不排除 QDII |
| 跟踪指数 | 多选精确匹配 `index_name`；货币 ETF 等空值统一为「无跟踪指数」 |
| 管理人 | 多选精确匹配 `mgr_name` |
| 规模 | 闭区间；空 = 不限；规模缺失行在启用规模条件时不命中 |
| 费率 | 闭区间；`mgt_fee` 缺失视为「未获取」，启用费率条件时不命中 |
| 涨跌幅 | 闭区间，百分比数值（-2 表示 -2%） |
| 成交额 | 闭区间，单位亿元，后端已换算 |
| 换手率 | 闭区间，百分比数值，T-1 口径 |
| 折溢价 | 闭区间，百分比数值，T-1 口径（收盘价 ÷ 净值 − 1） |
| 排除无报价 | 剔除 `fund_daily` 无记录 / 成交额为 0 的标的；默认开 |

---

## 四、结果表设计

### 4.1 默认列（13 列）

| 列 | 字段 | 来源 | 说明 |
|---|---|---|---|
| 代码 / 简称 | `code` / `name` | `etf_basic` | 简称 `font-medium`；代码 `font-mono text-xs`；QDII 加「跨境」tag |
| 收盘价 | `close` | `fund_daily` | 元，右对齐等宽 |
| 涨跌% | `pct_chg` | `fund_daily` | A 股红涨绿跌，正数带 `+` |
| 成交额(亿) | `amount_yi` | `fund_daily.amount`（千元）÷ 1e5 | 后端换算 |
| 换手%(T-1) | `turnover_pct` | `fund_daily.vol` ÷ `etf_share_size.total_share` | 经 `calc.ratio` 计算 |
| 规模(亿) | `size_yi` | `etf_share_size.total_size` ÷ 1e4 | T-1；缺失显示「—」 |
| 折溢价%(T-1) | `premium_pct` | `fund_daily.close` 与 `etf_share_size.nav` | 经 `calc.growth_rate` 计算；nav 缺失显示「—」 |
| 跟踪指数 | `index_name` | `etf_basic` | 空值「—」 |
| 管理人 | `mgr_name` | `etf_basic` | |
| 类型 | `fund_type` | `fund_basic` | 缺失归「其他」 |
| 费率% | `mgt_fee` | `etf_basic` | 保留 2 位小数 |
| 上市日 | `list_date` | `etf_basic` | 默认隐藏 |
| 份额(万份) | `total_share` | `etf_share_size` | 默认隐藏 |
| 操作 | — | — | 「☆ 加入自选」 |

- 列设置与股票筛选共用风格；偏好存 `vr-etf-screener-columns`。
- 默认排序：`size_yi` 降序；规模缺失行恒排末尾。
- 可排序列：收盘价、涨跌%、成交额、换手率、规模、折溢价、费率、上市日。
- 导出 CSV 与当前筛选结果、列设置一致。

### 4.2 行内动作与合规

| 动作 | 行为 |
|---|---|
| 加入自选 | 复用 `lib/watchlist.ts`，ETF 6 位代码原样保存 |
| 查看详情 | 点击 ETF 名称跳转 `/etf-data?code=<代码>` 并自动查询（见 [etf-data-page-ui-design.md](etf-data-page-ui-design.md)） |

- 不提供买卖/仓位/目标价建议；不基于折溢价给出「高估/低估」结论。
- 折溢价、规模均标注 T-1，不能当作盘中实时值。

---

## 五、数据来源与口径（tushare-only）

### 5.1 接口职责

| 接口 | 用途 | 关键字段 | 权限 / 限量 |
|---|---|---|---|
| `etf_basic` | ETF 宇宙与静态信息 | `ts_code, csname, index_code, index_name, setup_date, list_date, list_status, exchange, mgr_name, mgt_fee, etf_type` | ≥5000 积分；单次 ≤5000 条 |
| `fund_basic(market='E')` | 基金类型 | `ts_code, name, fund_type, status, list_date` | 公募基金接口，按 ETF 代码 join |
| `etf_share_size` | 每日份额 / 规模 / 净值 / 收盘价 | `trade_date, ts_code, total_share(万份), total_size(万元), nav, close` | ≥8000 积分；单次 ≤5000 条；次日 8:30 更新 |
| `fund_daily` | ETF 日线行情 | `ts_code, trade_date, open/high/low/close, pre_close, pct_chg, vol(手), amount(千元)` | ≥5000 积分；单次 ≤5000 行 |

调用示例（后端惰性导入，token 从环境变量读取）：

```python
import os, tushare as ts
pro = ts.pro_api(os.environ["TUSHARE_TOKEN"])
pro._DataApi__http_url = os.environ.get("TUSHARE_HTTP_URL", "").strip()

basic = pro.etf_basic(list_status="L",
    fields="ts_code,csname,index_code,index_name,setup_date,list_date,list_status,"
           "exchange,mgr_name,mgt_fee,etf_type")
fund = pro.fund_basic(market="E", status="L", fields="ts_code,name,fund_type,status")
share = pro.etf_share_size(trade_date="YYYYMMDD",
    fields="trade_date,ts_code,total_share,total_size,nav,close,exchange")
daily = pro.fund_daily(trade_date="YYYYMMDD",
    fields="ts_code,trade_date,close,pct_chg,vol,amount")
```

### 5.2 数据日确定与连接

1. 用 `trade_cal` 或直接按自然日向前回退（最多 5 个交易日），找到 **`etf_share_size` 与 `fund_daily` 同时有数据的最新交易日**，作为本页 `trade_date`。
2. 以 `etf_basic(list_status='L')` 为左表，按 `ts_code` 左连接 `fund_daily`、`etf_share_size`、`fund_basic`。
3. `fund_daily` 中包含 LOF/REITs 等非 ETF，**不进入结果**（只保留 ETF 宇宙内代码）。
4. 同一 `ts_code` 出现重复记录时保留一条；缺失项写 `null`，不填 0、不向前填充。
5. 所有金额换算在服务端完成：`total_size`（万元）→ 亿元；`fund_daily.amount`（千元）→ 亿元。

### 5.3 派生指标（必须经 `calc/`）

| 指标 | 公式 | calc 函数 | 无意义域处理 |
|---|---|---|---|
| 换手率 | `vol × 100 ÷ (total_share × 10000)` | `calc.formulas.ratio(vol*100, total_share*10000, label="turnover", unit_in="份")` | 分母 ≤ 0 → `not_meaningful`，前端显示「—」 |
| 折溢价 | `close ÷ nav − 1` | `calc.formulas.growth_rate(close, nav, label="premium")` | `nav ≤ 0` → `not_meaningful`，显示「—」 |

- `calc` 返回小数（如 0.0012）；后端在响应中提供 `*_pct` 百分比数值并保留原始值来源，前端只格式化展示。
- 不使用心算或前端公式；不使用「份额 × 价格」自算规模，规模只取 `etf_share_size.total_size`。

### 5.4 缺失与降级（必须在 UI 出声）

| 情况 | 表现 |
|---|---|
| 未配置 `TUSHARE_TOKEN` | 页面显示错误态：「ETF 筛选需要配置 TUSHARE_TOKEN」，附配置说明与重试；不展示空表 |
| 积分/权限不足（`etf_basic` 5000 / `etf_share_size` 8000） | 显示接口原始错误摘要 + 所需积分说明；不伪造数据 |
| 最新交易日无数据 | 自动回退最多 5 个交易日，并在工具条标注实际数据日 |
| 部分 ETF 无 `etf_share_size` | 规模/份额/折溢价显示「—」；工具条显示「规模缺失 N 只」；启用规模/折溢价条件时这些行不命中 |
| 部分 ETF 无 `fund_daily` | 收盘价/涨跌/成交额/换手率显示「—」；「排除无报价」开启时直接剔除 |
| `fund_type` 缺失 | 类型显示「其他」，并在筛选时归入「其他」 |
| 接口超时/失败 | 返回 502 + 原因；若已有缓存则继续展示旧数据并标 `stale`（含数据日），不把旧值当新值 |

---

## 六、后端接口设计

### 6.1 快照接口

```
GET /api/etf/screener/snapshot?refresh=1
```

一次返回全量 ETF（约 1,717 行），前端本地过滤；`refresh=1` 强制刷新日频数据。

```jsonc
{
  "as_of": "2026-10-24T11:20:03+08:00",  // 服务端抓取时间
  "trade_date": "2026-10-23",            // 数据所属交易日（T-1）
  "universe_as_of": "2026-10-23",
  "count": 1717,
  "size_missing": 71,
  "quote_missing": 12,
  "stale": false,
  "fields": ["code","name","close","pct_chg","amount_yi","turnover_pct","size_yi",
             "premium_pct","index_name","mgr_name","fund_type","is_qdii",
             "mgt_fee","total_share","exchange","list_date"],
  "rows": [["510300","沪深300ETF",4.178,-0.35,18.32,0.42,1473.53,0.12,
            "沪深300","华泰柏瑞基金","股票型",false,0.15,3524268.77,"SH","20120528"], …]
}
```

- 列式返回，复用股票快照的解码/表格模式，体积约 0.3–0.5 MB。
- 关键数字与 `trade_date` 同时返回；前端不推断日期。
- 不提供逐只详情接口；本页无按需增强（E2 已在快照内）。

### 6.2 缓存与刷新

| 数据 | TTL | 说明 |
|---|---|---|
| `etf_basic` + `fund_basic` | 12h | 静态信息，随进程常驻 |
| `etf_share_size` + `fund_daily` | 30min | 盘后数据，次日 8:30 后自然更新 |
| 组装后的快照 | 30min | stale-while-revalidate：过期先回旧并后台刷新 |

不轮询；仅在进入页面、点「刷新」或缓存过期时取数。

### 6.3 代码结构（沿用仓库惯例）

| 文件 | 变更 |
|---|---|
| `backend/astock.py` | 新增 `etf_basic_list()`、`etf_daily_bundle(trade_date)`（`etf_share_size` + `fund_daily` + `fund_basic` 合并），复用现有 tushare token / `TUSHARE_HTTP_URL` 读取方式与惰性依赖风格 |
| `backend/app.py` | 新增 `GET /api/etf/screener/snapshot`，含数据日回退、TTL 缓存、stale-while-revalidate、错误映射（无 token → 503，权限不足 → 502） |
| `frontend/src/lib/api.ts` | 新增 `EtfScreenerSnapshot` 类型与 `api.etfScreenerSnapshot()` |
| `frontend/src/lib/etf-screener.ts` | 新增：解码、条件默认值、过滤、排序、列定义、CSV（纯逻辑，可单测） |
| `frontend/src/components/etf-screener/` | 新增 `EtfScreenerFilters.tsx`、`EtfScreenerToolbar.tsx`、`EtfScreenerTable.tsx`、`RangeInput`/`MultiSelect` 复用现有 `components/screener/` 组件 |
| `frontend/src/pages/EtfScreener.tsx` | 新增页面主组件（状态编排与股票筛选页同构） |
| `frontend/src/router.tsx` | 新增 `/etf-screener` 路由 |
| `frontend/src/components/layout/Layout.tsx` | 导航在「股票筛选」下方插入「ETF 筛选」；`/etf-screener` 容器放宽到 `max-w-[1600px]` |

---

## 七、交互与状态

```
进入 /etf-screener
  → 拉 /api/etf/screener/snapshot
  → 解码 → 默认按规模降序展示（规模缺失排末尾）

编辑条件（写入 draft，不改结果）
  → 点「开始筛选」：applied = draft → 本地过滤 → 排序 → 回第 1 页 → 滚动到结果
  → 点「重置」：回默认条件并立即重筛

排序 / 分页 / 列设置 / 导出：纯前端
```

- `draft` / `applied`：`localStorage: vr-etf-screener-conditions`。
- `collapsed` / `hidden`：`vr-etf-screener-collapsed` / `vr-etf-screener-columns`。
- 竞态守卫 `runIdRef`：旧响应不覆盖新结果。
- 页面只发一个请求；1717 行本地过滤 <20ms。

---

## 八、视觉规范

- 完全复用现有 token 与 `GlassCard`：暖橙主色、`text-muted-foreground` 次级文字、`border-border/50` 边框、`shadow-glow` 仅主按钮。
- 数值列 `font-mono tabular-nums` 右对齐；涨跌红/绿；规模主数值 `font-medium`，单位用小字灰色。
- 类型/QDII 用中性 tag（`bg-muted/50`），不用警示色。
- 缺失值统一「—」+ `title` 说明（如「未获取到 2026-10-23 规模数据」），不用骨架条冒充加载态。
- 空结果提示：「没有符合条件的 ETF，试试放宽规模/类型条件。」
- 数据日与 `stale` 状态在工具条可见；过旧（>3 个交易日）转 `text-warning`。

### 8.1 响应式

| 断点 | 表现 |
|---|---|
| ≥1440px | 条件四卡一行 + 费率 3 / 行情 9；表格 13 列 |
| 1024–1440px | 两卡一行；表格 `min-w-[1080px]` 横向滚动 |
| <1024px | 单列堆叠；隐藏 换手/折溢价/份额/上市日，保留 代码、收盘、涨跌、成交额、规模、指数、类型、操作 |
| <640px | 区间输入单列；分页简化为「上一页 / 页码 / 下一页」 |

---

## 九、验收清单

1. 侧边栏「ETF 筛选」位于「股票筛选」正下方，`/etf-screener` 独立页面，激活态正常；股票筛选页不受影响。
2. 首屏能拉取全量上市 ETF，按规模降序；工具条显示命中数、数据日、规模缺失数、抓取时间。
3. 条件组合（交易所/类型/指数/管理人/规模/费率/行情/折溢价）均可生效，重置回默认。
4. 换手率与折溢价由后端经 `calc/` 计算；前端无自算公式；规模只取 `total_size`。
5. 未配置 token / 积分不足 / 部分数据缺失时，页面按 §5.4 显示明确原因，不出现空表冒充成功、不以 0 填充。
6. 折溢价与规模均标注 T-1；页面任意位置不出现「实时」误导。
7. CSV 导出与当前筛选结果、列设置一致；分页/排序/列设置刷新后保留。
8. 全页无投资动作建议措辞；不展示「高估/低估」判断。

---

## 十、分期建议

| 批次 | 内容 |
|---|---|
| 第一批 | `/api/etf/screener/snapshot`（tushare 四接口 join + calc 派生）；ETF 页面骨架、条件区、结果表、排序分页导出；导航与路由 |
| 第二批 | 列设置、折叠记忆、缺失数据降级打磨、数据日回退与 stale 提示 |
| 后续（本期不做） | `rt_etf_k` 实时开关（需权限）、ETF 详情页/K 线、历史规模曲线、成分股穿透 |

---

## 十一、相关文件索引

- `docs/ui-design/stock-screener-page-design.md`：股票筛选页设计（并列页面，交互与视觉参考）
- `docs/ui-design/stock-screener-api-call-plan.md`：股票快照调用链（ETF 页不复用其数据源）
- `frontend/src/pages/EtfScreener.tsx`：新增页面
- `frontend/src/components/etf-screener/`：新增组件
- `frontend/src/lib/etf-screener.ts`：纯逻辑
- `backend/astock.py` / `backend/app.py`：tushare 取数与接口
- `tushare-data/SKILL.md` 与 `tushare-data/references/数据接口.md`：`etf_basic`、`fund_basic`、`etf_share_size`、`fund_daily` 的接口登记
- 接口字段文档：`https://tushare.pro/wctapi/documents/385.md`（etf_basic）、`408.md`（etf_share_size）、`127.md`（fund_daily）、`19.md`（fund_basic）
