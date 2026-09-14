# 自选股页（/watchlist）UI 布局说明

> 范围：旧版 Web 应用（`frontend/`，`http://localhost:8901/watchlist`）。
> 目的：记录页面 UI 布局与交互。**§[C] 自选总览卡已按「腾讯 88 字段快照」（`docs/full-market-snapshot.md` §4）优化并落地**（表格规范对齐筛选结果表）；其余章节为现状描述。
> 页面文件：`frontend/src/pages/Watchlist.tsx`。
> 依赖组件/模块：`PageHeader`、`GlassCard`、`Disclaimer`、`AskAiButton`、`lib/watchlist.ts`、`hooks/useLiveQuotes.ts`、`lib/api.ts#quote`、`lib/screener.ts`（复用格式化）、`data/stock_codes.ts`（行业/板块）。

---

## 一、页面定位

- 「自选股」= 用户自己维护的一串 A 股代码 + 一屏总览其行情。数据只存本地（后端 JSON + localStorage 兜底），不上传。
- 与「股票筛选」互补：筛选是找标的，自选是跟踪已确定的标的。
- 路由：`/watchlist`，侧边栏标签「自选股」（`Star` 图标），位于「多空辩论」之下、「股票筛选」之上。

---

## 二、整体结构（自上而下，单列）

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [A] 页头 PageHeader                                                            │
│     自选股                                                  [实时行情] [让 AI 读自选] │
│     输入代码或名称模糊搜索添加，一屏总览你关注的标的。数据只存本地、不上传。      │
├───────────────────────────────────────────────────────────────────────────────┤
│ [B] 添加自选卡 GlassCard（mb-4）                                                │
│     ＋ 添加自选                    与「个股数据」同一输入框 · 代码/名称模糊搜索   │
│     ┌───────────────────────────────────────────────┐  ┌──────────┐            │
│     │ 输入代码或名称（如 600519 / 贵州茅台）           │  │ 🔍 添加  │            │
│     └───────────────────────────────────────────────┘  └──────────┘            │
│     ┌─ 下拉建议（聚焦并输入时浮现，按市值降序）──────────────┐                   │
│     │ 600519  贵州茅台                              15941 亿 │                   │
│     │ 600809  山西汾酒                               3120 亿 │                   │
│     └────────────────────────────────────────────────────────┘                   │
│     已添加 1 只                                        （hint，仅在操作后出现）  │
├───────────────────────────────────────────────────────────────────────────────┤
│ [C] 自选总览卡 GlassCard glow（已优化，沿用筛选结果表规范）                      │
│     ★ 自选总览（12）            实时 · 每 3 秒  15:04:21   [列设置▾]  ⟳          │
│  ┌────────────────┬─────────┬────────┬───────┬──────┬─────────┬──────┬─────────┬──────┬─────┐
│  │ 名称/代码      │  现价   │ 涨跌%  │换手%  │ 量比 │ PE(TTM) │  PB  │ 总市值  │ 行业 │ 操作│
│  ├────────────────┼─────────┼────────┼───────┼──────┼─────────┼──────┼─────────┼──────┼─────┤
│  │ 贵州茅台 600519│ 1275.16 │ -0.78% │ 0.28  │ 1.25 │  19.57  │ 6.34 │ 15941亿 │ 白酒 │ ↗ ✕ │
│  │ 宁德时代 300750│   xxx   │ +2.10% │  ...  │ ...  │   ...   │ ...  │   ...   │ 电池 │ ↗ ✕ │
│  └────────────────┴─────────┴────────┴───────┴──────┴─────────┴──────┴─────────┴──────┴─────┘
│   （数值列表头与单元格统一右对齐、等宽字体；表头可点击排序）                     │
│   共 130 条   每页 [25 ▾]              [上一页] 1 2 3 … 6 [下一页]               │
│   （默认每页 25 条；分页只影响展示，轮询与「让 AI 读自选」用完整列表）            │
├───────────────────────────────────────────────────────────────────────────────┤
│ [D] 免责声明 Disclaimer（通用组件）                                            │
└───────────────────────────────────────────────────────────────────────────────┘
```

页面外层是 `Layout` 的 `<main>` 容器（`mx-auto max-w-6xl px-6 py-6`），自选页沿用默认 `max-w-6xl`。

---

## 三、区域详解

### [A] 页头 `PageHeader`

- 组件：`frontend/src/components/ui/PageHeader.tsx`。
- 结构：左侧 `title`（`text-2xl font-extrabold tracking-tight text-glow`）+ `subtitle`（`mt-1 text-sm text-muted-foreground`）；右侧 `actions` 插槽（`flex items-center gap-2`，与标题基线对齐 `items-end`，窄屏 `flex-wrap` 换行）。
- 本页取值：
  - `title = "自选股"`
  - `subtitle = "输入代码或名称模糊搜索添加，一屏总览你关注的标的。数据只存本地、不上传。"`
  - `actions` = 两个控件（顺序固定）：
    1. **实时行情开关**（自定义按钮，非通用组件）：
       - 文案「实时行情」，前置一个圆点状态指示器：开启 `bg-primary`，关闭 `bg-muted-foreground/40`；轮询进行中在圆点外叠 `animate-ping` 脉冲环。
       - 开启态样式 `border-primary/50 bg-primary/10 text-primary`；关闭态 `border-border/60 text-muted-foreground hover:text-foreground`。
       - `title` 悬浮提示：「开启实时行情（交易时段每 3 秒自动刷新）」/「关闭实时行情」。
       - 默认**关闭**，状态持久化在 `localStorage` 键 `vr-watchlist-live`（值为 `on`/`off`）。
    2. **让 AI 读自选**（`AskAiButton`）：仅当 `codes.length > 0` 时渲染。点击从右侧滑出对话面板（`component fixed inset-0 z-50` + 半透明遮罩 + 右侧 `max-w-md` 玻璃卡片），以本页自选行情文本作为上下文；预置建议问题：「这几只里哪些估值偏高 / 帮我按赛道分组看看 / 各自最大的风险点是什么」。面板内对话按路由持久化（`localStorage` 前缀 `vr-askai-chat:`）。

### [B] 添加自选卡 `GlassCard`（`mb-4`）

> 目标：与「个股数据」页（`/stock-data`）**共用同一个 `StockCodeInput` 组件**，只做单只添加、支持模糊搜索；不做批量粘贴。卡头与 [C] 统一为「图标 + 标题 + 右侧浅色说明」。

#### B.1 结构与视觉

```
┌ 添加自选 ─────────────────────────── 与「个股数据」同一输入框 · 支持代码 / 名称模糊搜索 ┐
│  ┌───────────────────────────────────────────────┐  ┌──────────┐                     │
│  │ 输入代码或名称（如 600519 / 贵州茅台）           │  │ 🔍 添加  │                     │
│  └───────────────────────────────────────────────┘  └──────────┘                     │
│  下拉建议（聚焦输入时浮现，按市值降序）                                                │
│  已添加 1 只（hint，仅操作后出现）                                                     │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

- 卡头一行（`mb-2.5 flex flex-wrap items-center justify-between gap-2`）：左 `Plus` 图标（`text-primary`）+「添加自选」（`font-semibold`）；右浅色说明（`text-[11px] text-muted-foreground/70`）。
- 输入行与「个股数据」一致：同一个 `StockCodeInput`，样式/交互完全相同；自选页把输入框拉满（`inputClassName="flex-1 min-w-0"`），下拉宽度随容器（`dropdownClassName="w-full"`）。
- **图层（重要）**：`.glass` 的 `backdrop-filter: blur()` 会为玻璃卡创建**层叠上下文**。若不处理，[B] 卡内下拉建议的 `z-50` 只在 [B] 卡内部生效，而后渲染的 [C] 玻璃卡（`z: auto`）会整体盖住它。故 [B] 卡需 `relative z-30`，使其层叠顺序高于 [C] 卡，下拉即可正常浮在 [C] 之上。
- 反馈：`hint`（`mt-2 text-xs text-muted-foreground/70`）。

#### B.2 复用（与个股页同源，最大化复用）

- 复用组件：`frontend/src/components/stock/StockCodeInput.tsx` + `hooks/useStockSuggestions.ts`（`StockData` 用的同一个）。
- 为复用仅新增 4 个**可选** props（均有默认值，个股页行为不变）：`placeholder`、`actionLabel`（自选页传「添加」，个股页默认「查询」）、`inputClassName`、`dropdownClassName`。
- 添加逻辑复用 `lib/watchlist.ts#addCodes(codes, code)`（与其它入口同一套解析 + 去重）。

#### B.3 模糊查询与交互

- 输入**纯数字** → 按 6 位代码**前缀**匹配；输入**中文/其它** → 按**名称包含**匹配（本地 `STOCK_CODES`，即时返回）。
- 下拉先本地占位展示，防抖 300ms 后调 `/api/quote` 补市值，按市值降序取前 10。
- 键盘/鼠标：`↑/↓` 移动高亮、`Enter` 选中高亮项（无高亮选中首条，再退化为直接查询）、`Esc` 关闭；点击条目即选中。
- 选中后组件回调 `onSearch(code)` 传出 6 位代码。

#### B.4 反馈与边界

- 添加成功：清空输入 + hint「已添加 1 只」。
- 重复/未识别：hint「没识别到新的 6 位代码（可能已在自选里）」；不报错。
- 不校验代码是否真实存在、所属市场（与个股页一致：查不到就无行情显示为「—」）。
- 空态（自选总览卡）：见 [C] 的 C.5。

### [C] 自选总览卡 `GlassCard glow`（已实现：沿用筛选结果表规范）

> 已落地于 `frontend/src/pages/Watchlist.tsx`。列字段取自腾讯 88 字段快照（`docs/full-market-snapshot.md` §4 已标定字段）。
> **ROE 未纳入**：该数据源不含 ROE 字段；文档 §6.1 指向的 mootdx `finance()` 在本机不可用（无 `roe` 字段 + 通达信 7709 取不到数）。待接入东财业绩报表 `RPT_LICO_FN_CPD`（字段 `WEIGHTAVG_ROE`）后再加 ROE 列。

#### C.1 卡头

一行（`flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5`）：

- 左：`★ 自选总览（N）`（`Star` 图标 + `font-semibold` + 数量 `text-xs font-normal text-muted-foreground`）。
- 右（状态区 + 操作，`flex items-center gap-2 text-[11px] text-muted-foreground/70`）：
  - 状态（沿用现有优先级）：错误 `text-warning` ／ 暂停原因「已暂停（页面未激活）」「非交易时段 · 已暂停」／ 轮询中「实时 · 每 3 秒」（`text-primary/80`）／ 最近更新时间（`font-mono` `HH:MM:SS`）。
  - **列设置**下拉：勾选/隐藏列，持久化 `localStorage`（键 `vr-watchlist-columns`）。
  - **立即刷新**按钮（`RefreshCw`，`loading` 转圈），不受交易时段限制。

#### C.2 列定义（默认列 + 可选列）

默认列：

| 列 | 字段 | 对齐 | 说明 |
|----|------|------|------|
| 名称/代码 | `name` / `code` | 左 | 名称 `font-medium` 且链到 `/stock-data?code=xxx`（自动查询）；代码 `font-mono text-xs text-muted-foreground` 紧随 |
| 现价 | `price` | 右 | `font-mono tabular-nums` + 涨跌色 |
| 涨跌% | `change_pct` | 右 | 同色；正数带 `+` 前缀 |
| 换手% | `turnover_pct` | 右 | 等宽 |
| 量比 | `vol_ratio` | 右 | 等宽 |
| PE(TTM) | `pe_ttm` | 右 | ≤0 显示「—」 |
| PB | `pb` | 右 | ≤0 显示「—」 |
| 总市值 | `mcap_yi` | 右 | `fmtMcap`：≥1 万亿折「万亿」，否则「亿」 |
| 行业 | `industry` | 左 | `text-muted-foreground`，来自本地表 `STOCK_CODES` |
| 操作 | — | 右 | `↗ 查看`（跳个股数据，自动查询）+ `✕ 移除` |

可选列（列设置打开，默认隐藏）：振幅% `amplitude_pct`、流通市值 `float_mcap_yi`、成交额 `amount_wan`、板块 `board`（本地表）。

#### C.3 单元格与行规范（对齐筛选页 §3.7）

- **表头**：`sticky top-0 z-10 bg-card/95 backdrop-blur text-xs text-muted-foreground`；数值列**表头与单元格统一 `text-right`**；可排序列点击切换升降序，激活列文字/箭头转 `text-primary`。
- **数据行**：`h-10 border-b border-border/30 transition-colors hover:bg-muted/40`。
- **数值单元格**：`text-right font-mono tabular-nums`；文本列左对齐。
- **涨跌配色**（A股红涨绿跌）：`> 0 → text-danger`、`< 0 → text-success`、`= 0/无 → text-muted-foreground`；「现价」与「涨跌%」两列同时按 `change_pct` 着色。
- **缺失值**：一律「—」，不用空字符串（避免看起来像 0）。
- **停牌标记**：报价日期落后于本批最新日期时，在名称后加 `rounded bg-warning/10 px-1.5 text-[11px] text-warning`「停牌」（用 `ts` 批内相对新鲜度，避免盘前/收盘后误标）。

#### C.4 交互

- **排序**：点击表头排序（默认仍为添加顺序，点击后按列排序；数值列缺失值沉底）。
- **查看个股**：点名称或操作列「↗」→ `/stock-data?code=xxx`，个股页自动查询该股。
- **移除**：操作列「✕」逐行移除（保持现有逻辑）。
- **列设置**：勾选列，持久化 `localStorage`；名称列常显不可隐藏。

#### C.5 空态 / 加载

- 无自选：空态「还没有自选股，用上面的输入框搜索代码或名称添加。」。
- 首帧数据未到：单元格显示「—」。
- 自选数量超过一页时按 C.6 分页；窄屏靠 `overflow-x-auto` 横向滚动。

#### C.6 分页（参考筛选结果表的分页展示）

- **默认每页 25 条**；每页可选 `25 / 50 / 100`（`h-7` 下拉）。
- 表体只渲染当前页：`rows.slice((page-1)*pageSize, page*pageSize)`；总数 `共 N 条`。
- 分页条位于表格下方一行（`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5`）：
  - 左：`共 N 条`（`text-xs text-muted-foreground`）+ `每页 [25 ▾]`（`h-7 rounded-md border border-border bg-black/20 px-2 text-xs`）。
  - 右：分页器 = `上一页` + 页码窗口（首/末页常驻，当前页前后 ±1，中间用 `…`）+ `下一页`；当前页 `rounded bg-primary/15 px-2.5 py-1 text-primary`，其余 `text-muted-foreground hover:text-foreground`，禁用态 `opacity-40`；仅 1 页时不显示页码按钮。
- 页码越界（因删除/改每页/排序导致页数变少）：用 `safePage = min(page, totalPages)` 夹取，不出现空白页。
- 自选增删后页码复位到第 1 页。
- 分页只影响「展示」：实时行情轮询与「让 AI 读自选」始终使用**完整自选列表**，不受分页影响。

#### C.7 复用与依赖

- **复用** `frontend/src/lib/screener.ts` 的纯函数：`fmt2` / `fmtPct` / `fmtMcap` / `fmtAmount` 与列对齐/配色约定。
- **`Quote` 接口已扩展**（`frontend/src/lib/api.ts`）：补齐 `vol_ratio`、`amplitude_pct`、`amount_wan`、`float_mcap_yi`、`security_type`、`is_stale`、`ts`（后端 `/api/quote` 本就返回这些腾讯字段）。
- **ROE 待接入**：改用东财业绩报表 `RPT_LICO_FN_CPD`（`WEIGHTAVG_ROE`，全市场按报告期批量、季度级缓存）后再新增 ROE 列。

> 行顺序默认仍为自选添加顺序（与筛选页默认按总市值不同）。

### [D] 免责声明 `Disclaimer`

- 通用组件，`mt-8` 横条：`Info` 图标 + 中立声明（只呈现公开数据，不推荐/不预测/不构成投资建议）。

---

## 四、数据与状态

| 项 | 说明 |
|----|------|
| 自选列表 | `codes: string[]`；读取 `loadWatch()`（后端 `/api/watchlist` 优先，`localStorage` 键 `vr-watchlist` 兜底）；写入 `saveWatch()`（先写本地、再异步写后端） |
| 行情数据 | `useLiveQuotes(codes, live)` → `GET /api/quote?codes=...`（腾讯，返回 `Record<code, Quote>`） |
| 轮询频率 | `LIVE_INTERVAL_MS = 3000`（A 股 level-1 快照粒度）；递归 `setTimeout`，不堆叠请求 |
| 自动暂停条件 | 开关关、页面不可见（`document.hidden`）、非交易时段（北京时间 9:15–11:30 / 13:00–15:00，周一至周五，不含节假日）；暂停时保持 10s 心跳以便自动恢复 |
| 失败退避 | 连续失败间隔翻倍，上限 30s；连续失败 ≥2 次才提示「行情获取失败，正在重试…」 |
| 时区 | 统一换算北京时间（不依赖本机时区） |
| 竞态处理 | 请求在飞行中跳过本拍并标记「stale」，回来后补拉一次；`codes` 变化即时重拉 |
| 分页状态 | `page` / `pageSize`（默认 25，可选 25/50/100）；仅影响表体渲染，不影响 `useLiveQuotes(codes)` 与 AI 上下文（始终用完整 `codes`） |
| 实时开关持久化 | `localStorage` 键 `vr-watchlist-live`（`on`/`off`），默认关闭 |

---

## 五、视觉规范（复用全站 token）

与全站一致，未引入新变量：容器 `GlassCard`（`.glass`，本页总览卡用 `glow` 变体）、主色 `--primary`（暖橙）、次级文字 `text-muted-foreground`、边框 `border-border/*`、涨 `text-danger`、跌 `text-success`、警示 `text-warning`、光晕 `shadow-glow`。间距沿用 `p-4/p-5`、`mb-4`、`px-2 py-2.5` 等。

---

## 六、本次优化落地情况

数据来源：腾讯 88 字段快照（`docs/full-market-snapshot.md` §4），经 `/api/quote` 返回（含 `vol_ratio`/`amplitude_pct`/`amount_wan`/`float_mcap_yi`/`security_type`/`is_stale`/`ts`）。

| # | 优化项 | 状态 |
|---|--------|------|
| 1 | 数值列表头与单元格统一 `text-right` + 等宽字体 | ✅ 已实现 |
| 2 | 表头点击排序（默认仍为添加顺序，数值缺失值沉底） | ✅ 已实现 |
| 3 | 「名称」「代码」合并为一列，名称链到 `/stock-data?code=` 自动查询 | ✅ 已实现 |
| 4 | 默认列扩为 名称代码/现价/涨跌%/换手%/量比/PE/PB/总市值/行业/操作 | ✅ 已实现 |
| 5 | 行 `hover:bg-muted/40`；停牌标记（按 `ts` 批内相对新鲜度） | ✅ 已实现 |
| 6 | 操作列增加「↗ 查看」，与「✕ 移除」并列 | ✅ 已实现 |
| 7 | 列设置下拉，持久化 `vr-watchlist-columns`（名称列不可隐藏） | ✅ 已实现 |
| 8 | 可选列：振幅% / 流通市值 / 成交额 / 板块（默认隐藏） | ✅ 已实现 |
| 9 | ROE 列 | ⏸ 未纳入：腾讯快照无 ROE；mootdx 源不可用。待接入东财 `RPT_LICO_FN_CPD`（`WEIGHTAVG_ROE`）后再加 |
| 10 | 分页：默认每页 25 条、可选 25/50/100，分页条与筛选页一致（C.6） | ✅ 已实现 |
| 11 | 添加不做校验（任意 6 位码进自选，非法码行情显示「—」） | 保持 |
| 12 | 窄屏横向滚动 | 保持 |

---

## 七、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Watchlist.tsx` | 页面主体（本页 UI） |
| `frontend/src/components/ui/PageHeader.tsx` | 页头（标题/副标题/actions 插槽） |
| `frontend/src/components/ui/GlassCard.tsx` | 玻璃卡片容器（`glass` / `glow`） |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/components/ui/Pager.tsx` | **通用分页器**（筛选页与自选页共用；上一页/下一页 + 页码窗口 + 省略号） |
| `frontend/src/components/ui/AskAiButton.tsx` | 「让 AI 读自选」右侧对话面板 |
| `frontend/src/components/stock/StockCodeInput.tsx` | **与个股页共用的代码/名称模糊搜索输入框**（本次新增 `placeholder`/`actionLabel`/`inputClassName`/`dropdownClassName` 可选 props） |
| `frontend/src/hooks/useStockSuggestions.ts` | 模糊搜索建议（本地匹配 + 防抖补市值） |
| `frontend/src/hooks/useLiveQuotes.ts` | 轮询、交易时段判断、退避 |
| `frontend/src/lib/watchlist.ts` | 自选读写（`loadWatch`/`saveWatch`/`addCodes`） |
| `frontend/src/lib/api.ts` | `api.quote(codes)` 行情接口（`Quote` 已扩展腾讯字段） |
| `frontend/src/lib/screener.ts` | 复用其格式化函数（`fmt2`/`fmtPct`/`fmtMcap`/`fmtAmount`）与列对齐约定 |
| `frontend/src/data/stock_codes.ts` | 由代码带出「行业」「板块」列 |

> 你可以直接在本文上标注要改的地方（布局、列、交互、配色、空态等），我再据此改 `Watchlist.tsx`。
