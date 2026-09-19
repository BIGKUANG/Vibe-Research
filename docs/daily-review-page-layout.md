# 每日复盘页（/daily-review）UI 布局说明

> 范围：旧版 Web 应用（`frontend/` + `backend/`，`http://localhost:8901/daily-review`）。
> 目的：记录该页的布局、区块顺序、数据来源与状态处理，供后续改动对照。
> 页面文件：`frontend/src/pages/DailyReview.tsx`（562 行）。
> 依赖组件/模块：`PageHeader`、`GlassCard`、`AskAiButton`、`SaveNoteButton`、`Disclaimer`、`StockCodeInput`、`lib/api.ts`、`lib/llm.ts`、`lib/watchlist.ts`、`lib/notes.ts`。
> 说明：该页是登录后的前端渲染页面（`/` 默认重定向到此页），本文依据当前源码整理，非截图录入。

---

## 一、页面定位

- 「每日复盘」= 全站默认首页，把**大盘 / 全球市场 / 自选 / 情绪 / 热榜 / 成交额 / 板块资金**压到一屏，再把客观数据交给用户自己配置的 AI 出复盘。
- 侧边栏第一项（`Activity` 图标，`Layout.tsx:24`），`/` 路由 `Navigate` 重定向到 `/daily-review`（`router.tsx:23`）。
- 内容区沿用 `Layout` 默认宽度 `mx-auto max-w-6xl px-6 py-6`。
- 定调：页面本身只呈现客观公开数据与榜单，不荐股、不预测；分析结论由用户接入的 AI 给出。
- 区块顺序（自上而下）：页头 → 大盘指数 → 全球市场 → **AI 当日复盘** → **市场情绪** → 关注股票 → 短线情绪 → 同花顺热榜 → 成交额 TOP20 → 板块资金趋势榜 → 资金轮动 → 免责声明。AI 复盘紧跟在两个指数块之后，**先给结论**；市场情绪紧随其后给出**当日盘面强度**，再往下才是个股自选与各类榜单。

---

## 二、整体结构（自上而下，单列）

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ [A] 页头 PageHeader                                                                  │
│     每日复盘                            更新于 15:04:21  [⟳ 更新]  [✨ 问 AI]        │
│     2026/09/17 · 大盘 / 情绪 / 板块资金一屏看全，交给你的 AI 做复盘                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [B] 大盘指数  h3 小节标题                                                            │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐                │
│  │ 上证指数      │ │ 深证成指      │ │ 创业板指      │ │ 科创50        │  (2/4 列)     │
│  │ 3xxx.xx      │ │ ...          │ │ ...          │ │ ...          │                │
│  │ +0.xx%       │ │              │ │              │ │              │                │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘                │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [C] 全球市场  🌐 隔夜外围 · A 股常看美股 / 港股脸色   （有数据才渲染）                 │
│  5 张卡（2/5 列）：名称+地区 / 点位 / 涨跌%                                          │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [D] AI 当日复盘  GlassCard glow（紧随大盘 / 全球市场，先给结论再给明细；可折叠）        │
│     [✨ AI 当日复盘 ⌄]                        [✨ 让 AI 复盘今天 / 重新复盘]          │
│     · 卡头标题行可点：折叠 / 展开（默认展开，ChevronDown 旋转 90°）                    │
│     · 点「复盘」按钮一律先展开，再流式生成                                             │
│     · 未接入 AI → 警示条 + 链接「先去接入你的 AI」(/settings)                        │
│     · 未生成 → 说明文案「分析是它给的，我们只负责喂数据」                             │
│     · 已生成 → Markdown 正文（react-markdown + remark-gfm）+ [存入沉淀]              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [E] 市场情绪  📊 Gauge（紧随 AI 复盘，先看当日盘面强度，再看个股与榜单）              │
│     ┌ 大盘宽度 ────────┐ ┌ 题材投机 ────────┐   （2 列大格，主色大号字 + 档位说明）  │
│     8 个小格（4 列）：上涨 / 下跌 / 平盘 / 涨停 / 真实涨停 / 跌停 / 真实跌停 / 活跃度 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [F] 关注股票  GlassCard（relative z-30，保下拉建议不被下方玻璃卡盖住）                │
│     [ 输入代码或名称（如 600519 / 贵州茅台）        ] [ 增加 ]                        │
│     ┌ 自选网格 2/3/4 列：名称 / 现价 / 涨跌%，行 hover 右上角出现 ✕ 移除 ──────────┐  │
│     └ 空态文案：加上你关注的股票…数据存本地，不上传 ───────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [G] 短线情绪  🔥 连板股 · 打板情绪 · 客观公开榜单                                     │
│     4 个计数格：涨停 / 跌停 / 最高连板 / 连板（2板+）                                 │
│     3 个比率格：封板率 / 炸板率 / 晋级率                                             │
│     涨停梯队表（含首板，默认 20 条）：名称 | 连板 | 现价 | 涨停% | 成交额 | 流通市值 | 概念 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [H] 同花顺热榜  🔥 人气飙升 · 默认 20 条 · 客观公开榜单                               │
│     表：# (含 ▲/▼ 排名变动) | 名称 | 涨跌幅 | 人气值 | 标签 | 概念(前 3)              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [I] 全市场成交额 TOP20  📊                                                           │
│     表：# | 名称 | 现价 | 涨跌% | 成交额 | 总市值 | 行业                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [J] 板块资金趋势榜  📈 行业 · 按今日净流入排序                                        │
│     表（前 15 行）：行业 | 涨跌% | 今日净流入 | 流入 | 流出 | 家数                    │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [K] 资金轮动  ↕ 板块级净流入 / 流出      （2 列并排）                                 │
│     ┌ 流入 Top（前 20）──────────┐  ┌ 流出 Top（末 20 逆序）──────┐                   │
│     │ 1 行业名  +x%   +xx 亿     │  │ …                          │                   │
│     └────────────────────────────┘  └────────────────────────────┘                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [L] 免责声明 Disclaimer                                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**区块间节奏**：每块标题为 `mb-3` 小节头 + 卡片 `mb-6`，全页单列右对齐堆叠，无侧栏、无 Tab、无折叠。

---

## 三、区域详解

### [A] 页头 `PageHeader`（`DailyReview.tsx:152-173`）

| 项 | 取值 |
|----|------|
| `title` | 每日复盘 |
| `subtitle` | `{今天 yyyy/mm/dd} · 大盘 / 情绪 / 板块资金一屏看全，交给你的 AI 做复盘` |
| `actions` | 三个控件，顺序固定 |

`actions` 从左到右：

1. **更新时间**（`updatedAt` 非空才渲染）：`text-[11px] text-muted-foreground/60`，格式 `更新于 HH:MM:SS`（`toLocaleTimeString("zh-CN", { hour12: false })`）。
2. **更新按钮**：`RefreshCw` 图标 +「更新」；刷新中换成 `Loader2` 转圈。`title` 明确写出「更新该页面所有数据（大盘 / 全球 / 关注股票 / 情绪 / 热榜 / 成交额 / 板块资金）」。
3. **问 AI**（`AskAiButton`）：`context = "今日大盘数据：{指数摘要}"`，预置问题 `今天大盘怎么走 / 哪些指数领涨领跌 / 盘面有什么值得注意`。点击从右侧滑出 `max-w-md` 玻璃对话面板（`fixed inset-0 z-50` + 黑色半透明遮罩），对话按路由持久化在 `localStorage`（前缀 `vr-askai-chat:`，单页上限 40 条）。

### [B] 大盘指数（`:175-194`）

- 小节头：`h3` +「大盘指数」（`text-sm font-semibold text-muted-foreground`）。
- 卡片栅格：`grid grid-cols-2 gap-3 sm:grid-cols-4`，每张 `GlassCard p-3`。
- 卡内三行：指数名（`text-xs` 截断）/ 点位（`font-mono text-lg font-bold`）/ 涨跌%（`text-xs`，正数带 `+`）。
- 数据未到：渲染 4 张占位卡，文案在「加载中…」与「行情未接通」（请求失败）之间切换。
- 数据源：`GET /api/indices` → `IndexQuote[]`（`name / price / change_pct / change_amt`）。

### [C] 全球市场（`:196-215`）

- **仅当 `globalIdx.length > 0` 时整块渲染**（取不到就整段不出，不留空卡与报错）。
- 小节头带 `Globe` 图标 + 右侧浅色说明「隔夜外围 · A 股常看美股 / 港股脸色」。
- 栅格 `grid grid-cols-2 gap-3 sm:grid-cols-5`，每卡：名称 + 地区（`text-muted-foreground/40`）/ 点位 / 涨跌%。
- `change_pct == null` 时点位与涨跌显示「—」并用中性色，不参与涨跌配色。
- 数据源：`GET /api/global/indices`（东财域内源，移植自 global-stock-data）。

### [D] AI 当日复盘（`:217-263`）

- 卡片：`GlassCard glow`（唯一带光晕的卡，视觉权重最高），位置紧随大盘 / 全球市场 —— **先给结论，再给明细**。
- 卡头：`Sparkles` 图标 +「AI 当日复盘」+ `ChevronDown`，三者包在一个 `<button>` 里作为**折叠开关**；右侧主按钮文案随状态切换「让 AI 复盘今天 / 重新复盘」，生成中禁用并转圈。
- **折叠 / 展开**：
  - 默认**展开**（`reviewCollapsed = false`）；点卡头标题行切换，`ChevronDown` 收起时旋转 `-90°`（过渡动画），同步 `aria-expanded`，`title` 在「收起复盘 / 展开复盘」间切换。
  - 折叠时只保留卡头一行：正文、状态条、生成按钮之外的说明全部隐藏；已生成复盘时右侧补一句浅色「复盘已收起」（`sm:inline`，窄屏不占位）。
  - **点「让 AI 复盘今天 / 重新复盘」一律先展开**（`runReview()` 开头 `setReviewCollapsed(false)`），再走生成，保证过程与结果直接可见。
  - 折叠态只是组件 `state`，**不持久化**：刷新 / 重新进入页面回到默认展开。
- 输入给模型的内容 = 当天指数客观摘要（`dataSummary`），提示词明确要求「只做客观陈述与多视角分析，不预测涨跌、不推荐任何标的、不构成投资建议」。
- 三种状态：
  1. **未接入 AI**（`needConfig`）：警示条 + 链接「先去接入你的 AI」（跳 `/settings`）。
  2. **未生成**：说明文案「点上方按钮，系统把当天客观数据打包给你的 AI，由它生成复盘。**分析是它给的，我们只负责喂数据。**」
  3. **已生成**：`prose prose-sm dark:prose-invert` 渲染 Markdown，正文下方 `SaveNoteButton`（`kind="复盘"`，标题 `每日复盘 {日期}`）存入「研究记录」。
- 失败：`AlertCircle` + 错误文案条。
- 生成走 `lib/llm.ts#chatStream` 流式追加；**「更新」按钮不会重跑这段**（避免每次刷新消耗模型额度）。

### [E] 市场情绪（`:265-296`）

- 小节头：`Gauge` 图标 +「市场情绪」，紧随 AI 复盘 —— 先看当日盘面强度，再看下方个股与榜单。
- 上半：`grid gap-3 sm:grid-cols-2`，两张大格「大盘宽度」「题材投机」，值为文字档位（冰点 / 偏弱 / 中性 / 偏强 / 普涨；冰点 / 普通 / 活跃 / 亢奋），下行 `text-[11px]` 说明候选档位。
- 下半：`grid grid-cols-4 gap-2` 8 个小格，顺序固定 —— 上涨家数 / 下跌家数 / 平盘 / 涨停 / 真实涨停 / 跌停 / 真实跌停 / 活跃度；涨类 `text-danger`、跌类 `text-success`、中性 `text-foreground`。
- 数据源：`GET /api/market/overview` 的 `sentiment`（`MarketOverview = { sentiment, sectors, updated }`）。

### [F] 关注股票（自选）（`:298-339`）

- 卡片：`GlassCard` + **`relative z-30`**。原因（源码注释）：`.glass` 的 `backdrop-filter` 会创建层叠上下文，不抬高的话输入框下拉建议的 `z-50` 只在本卡内生效，会被下方后渲染的玻璃卡（[G]/[H]…）盖住。
- 输入行：复用 `StockCodeInput`（与「个股数据」「自选股」页同款），`actionLabel="增加"`，`placeholder="输入代码或名称（如 600519 / 贵州茅台）"`，输入框拉满（`flex-1 min-w-0`）、下拉宽度 `w-full`。
- 添加逻辑：`lib/watchlist.ts#addCodes`（与其它入口同一套解析 + 去重）→ 更新 state → `saveWatch` → 立即刷行情。
- 自选网格：`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4`，每格 `rounded-lg bg-muted/25 p-3`，显示 名称 / 现价 / 涨跌%；移除按钮 `✕` 默认 `opacity-0`，卡片 `group-hover` 时显现。
- 行情未回：名称回退显示 6 位代码，价格「—」，颜色 `text-muted-foreground/40`。
- 空态：加上你关注的股票，随时看它们的实时价格与涨跌。数据存本地，不上传。
- 数据源：`loadWatch()`（后端 `/api/watchlist` 优先、`localStorage` 键 `vr-watchlist` 兜底）+ `GET /api/quote?codes=...`。

### [G] 短线情绪（`:341-415`）

- 小节头：`Flame` 图标 +「短线情绪」，附注「连板股 · 打板情绪 · 客观公开榜单」。
- 三层结构：
  1. 计数（`grid grid-cols-2 gap-2 sm:grid-cols-4`）：涨停（红）/ 跌停（绿）/ 最高连板 `{n} 板` / 连板（2板+）`{n} 家`（主色）。
  2. 比率（`grid grid-cols-3 gap-2`）：封板率（红）/ 炸板率（绿）/ 晋级率（红），值为 `(v*100).toFixed(1)%`，`null` 显示「—」，每格下方带口径说明（封住 / 尝试涨停、炸板 / 尝试涨停、昨涨停今又停）。
  3. 涨停梯队表（含首板，默认 20 条）：`名称(代码) | 连板 | 现价 | 涨停% | 成交额 | 流通市值 | 概念`；成交额与流通市值经 `yi()` 转「亿」；表上标注「客观公开榜单，非推荐 / 非预测」；无涨停时显示「今日无涨停个股」。
- 容器 `overflow-x-auto`，窄屏横向滚动。
- 数据源：`GET /api/market/emotion` → `ShortTermEmotion`。

### [H] 同花顺热榜（`:417-475`）

- 小节头：`Flame` 图标 +「同花顺热榜」，附注「人气飙升 · 默认展示 20 条 · 客观公开榜单，非推荐 / 非预测」。
- 表列：`# | 名称 | 涨跌幅 | 人气值 | 标签 | 概念`。
  - `#` 列：排名 + 排名变动（`rank_chg > 0` 红 `▲n`，`< 0` 绿 `▼n`）。
  - 名称列 `title` 挂 `reason`（上榜原因）。
  - 人气值用 `toLocaleString("zh-CN")` 千分位。
  - 标签为主色小胶囊；概念最多展示前 3 个中性边框小签。
- 数据源：`GET /api/market/ths-hot` → `ThsHot`。

### [I] 全市场成交额 TOP20（`:477-513`）

- 小节头：`BarChart3` 图标 +「全市场成交额 TOP20」，附注「客观公开榜单，非推荐 / 非预测 / 不构成投资建议」。
- 表列：`# | 名称 | 现价 | 涨跌% | 成交额 | 总市值 | 行业`；`price / pct` 为 `null` 时显示「—」不编值。
- 数据源：`GET /api/market/turnover-top` → `TurnoverTop`。

### [J] 板块资金趋势榜（`:515-548`）

- 小节头：`TrendingUp` 图标 +「板块资金趋势榜」，附注「行业 · 按今日净流入排序」。
- 表列：`行业 | 涨跌% | 今日净流入 | 流入 | 流出 | 家数`；**取前 15 行**（`sectors.slice(0, 15)`）；净流入带 `+` 前缀并按正负着色。
- 数据源：`GET /api/market/overview` 的 `sectors`（`SectorFlow`），与 [E] 同一次请求。

### [K] 资金轮动（`:550-578`）

- 小节头：`ArrowDownUp` 图标 +「资金轮动」，附注「板块级净流入 / 流出」。
- 两列并排 `grid gap-4 md:grid-cols-2`：
  - 左「流入 Top」：`sectors.slice(0, 20)`（`ROTATION_TOP = 20`），`TrendingUp` 红色标题。
  - 右「流出 Top」：`[...sectors].slice(-20).reverse()`（末尾 20 条逆序），`TrendingDown` 绿色标题。
- 行内布局：序号（`w-5`）/ 行业名（`flex-1 truncate`）/ 涨跌%（等宽）/ 净额（`w-20 text-right`，单位「亿」），行间 `border-b border-border/30`。

### [L] 免责声明 `Disclaimer`（`:580`）

- 通用组件，`mt-8`：`Info` 图标 + 中立声明（只呈现公开数据与榜单，不推荐个股、不预测涨跌、不构成投资建议；分析方向由用户自己配置的 AI 给出）。

---

## 四、数据与状态

### 4.1 接口映射

| 区块 | 接口 | 返回类型 | 失败处理 |
|------|------|----------|----------|
| [B] 大盘指数 | `GET /api/indices` | `IndexQuote[]` | `idxErr=true` → 占位卡显示「行情未接通」 |
| [C] 全球市场 | `GET /api/global/indices` | `GlobalIndex[]` | 静默吞掉，整块不渲染 |
| [D] AI 当日复盘 | 无接口（`lib/llm.ts#chatStream`，用当天指数摘要作上下文） | 流式文本 | 未接入 / 失败各自的状态条 |
| [E] 市场情绪 + [J] 板块资金 | `GET /api/market/overview` | `MarketOverview` | `ovDone=true` → 「暂无数据…」提示 |
| [F] 自选行情 | `GET /api/quote?codes=...` | `Record<code, Quote>` | 静默吞掉，单元格显示「—」 |
| [G] 短线情绪 | `GET /api/market/emotion` | `ShortTermEmotion` | `emoDone=true` → 同上 |
| [H] 同花顺热榜 | `GET /api/market/ths-hot` | `ThsHot` | `thsDone=true` → 同上 |
| [I] 成交额榜 | `GET /api/market/turnover-top` | `TurnoverTop` | `toDone=true` → 同上 |
| [F] 自选列表 | `lib/watchlist.loadWatch()`（`/api/watchlist` + `localStorage`） | `string[]` | 回退本地 |

### 4.2 刷新与加载态

- `refreshAll()`（`:57-75`）：一次性并发刷新 **6 个市场数据块 + 自选（重读列表 + 行情）**，`Promise.all(...).finally` 统一收尾；首屏 `useEffect` 调用的就是它，保证「首次进入」与「点更新」行为一致。
- 刷新开始即复位 `ovDone / emoDone / toDone / thsDone` 并清 `idxErr`，各块重新回到「加载中…」。
- 占位文案由 `pending(done)` 统一产出：`done=false` → 「加载中…」；`done=true` → 「暂无数据：可能是非交易时段或数据源暂时不可用，可点右上角「更新」重试」。**区分「加载中」与「数据源不可用」，不静默留白。**
- 收尾写入 `updatedAt` 并展示在页头；`refreshing` 期间「更新」按钮转圈。
- **AI 复盘不参与刷新**：`chatStream` 生成的内容属 LLM 输出而非数据，不自动重跑。

### 4.3 格式化与常量

| 项 | 定义 |
|----|------|
| `fmt(v)` | `toLocaleString("zh-CN", { maximumFractionDigits: 2 })` |
| `yi(v)` | `null → "—"`，否则 `v / 1e8` 后拼「亿」（元 → 亿） |
| `pctColor(p)` | `> 0 → text-danger`、`< 0 → text-success`、`= 0 → text-muted-foreground` |
| `ROTATION_TOP` | `20`（资金轮动流入/流出各展示条数） |
| 板块资金趋势榜行数 | 前 15 |
| 涨停梯队 / 热榜条数 | 后端默认 20 |

**配色取向（有意为之，勿改）**：A 股红涨绿跌；[C] 全球市场的美股 / 港股指数**同样沿用红涨绿跌**，与整个看板及东财等国内平台一致，对中国用户最不易看错（源码 `:17-18` 注释，Simon 2026-07-05 确认；非国际惯例）。

---

## 五、视觉规范（复用全站 token）

| 语义 | 取值 |
|------|------|
| 页面容器 | `Layout` 的 `mx-auto max-w-6xl px-6 py-6`（本页未放宽） |
| 卡片容器 | `GlassCard`（`.glass`：半透明填充 + 发丝边框 + 顶部内高光），[D] 用 `glow` 变体 |
| 小节标题 | `h3 text-sm font-semibold text-muted-foreground`，与卡片间距 `mb-3`，卡片之间 `mb-6` |
| 卡片头部图标 | 与标题同色（`muted-foreground`），仅 [D] `Sparkles` 用主色 |
| 副说明文字 | `text-[11px] text-muted-foreground/50` |
| 数值 | `font-mono`，表头与单元格同列风格 |
| 涨 / 跌 | `text-danger` / `text-success`（`+` 前缀） |
| 小格底色 | `bg-muted/25`（大格）/ `bg-muted/20`（小格）/ `bg-muted/25`（自选格） |
| 主色 | `--primary`（暖橙），用于图标、主按钮（`bg-primary/15 text-primary` / `hover:bg-primary/25`）与 `shadow-glow` |
| 表格 | `w-full text-sm`，表头 `text-xs text-muted-foreground` + `border-b border-border/50`，行 `border-b border-border/30`，容器 `overflow-x-auto` |
| 警示 / 错误 | `border-warning/30 bg-warning/5`（未接入 AI）/ `border-destructive/30 bg-destructive/5`（错误条） |

---

## 六、合规与降级要点

1. **事实与 AI 结论分离**：页面只呈现数据与榜单，每张榜单都带「客观公开榜单，非推荐 / 非预测」标注；分析文案由用户自己的 AI 生成，页面上明写「分析是它给的，我们只负责喂数据」。
2. **AI 提示词自带红线**：复盘 prompt 明确「不预测涨跌、不推荐任何标的、不构成投资建议」。
3. **取不到不编值**：缺数据显示「—」，请求失败显示明确占位文案，不用旧值或空表冒充成功。
4. **降级出声**：`pending(done)` 区分「加载中」与「非交易时段 / 数据源暂不可用」并给出重试入口。
5. **本地优先**：自选列表与问 AI 对话存本机（`localStorage` + 后端 JSON 兜底），不上传。

---

## 七、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/DailyReview.tsx` | 页面主体（本页全部区块与状态） |
| `frontend/src/components/layout/Layout.tsx` | 侧边栏 + 内容容器（`max-w-6xl`） |
| `frontend/src/router.tsx` | `/` 重定向与 `/daily-review` 路由 |
| `frontend/src/components/ui/PageHeader.tsx` | 页头（标题 / 副标题 / actions 插槽） |
| `frontend/src/components/ui/GlassCard.tsx` | 玻璃卡片容器（`glass` / `glow`） |
| `frontend/src/components/ui/AskAiButton.tsx` | 「问 AI」右侧滑出对话面板（按路由持久化） |
| `frontend/src/components/ui/SaveNoteButton.tsx` | 「存入沉淀」写入研究记录 |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/components/stock/StockCodeInput.tsx` | 代码 / 名称模糊搜索输入框（与自选、个股页共用） |
| `frontend/src/lib/api.ts` | 上述全部接口与类型定义（`IndexQuote` / `GlobalIndex` / `MarketOverview` / `ShortTermEmotion` / `ThsHot` / `TurnoverTop` / `Quote`） |
| `frontend/src/lib/llm.ts` | `hasLlm()` / `chatStream()`（AI 复盘与问 AI 共用） |
| `frontend/src/lib/watchlist.ts` | `loadWatch` / `saveWatch` / `addCodes` |
| `frontend/src/lib/notes.ts` | `addNote`（研究记录沉淀） |

> 可对照 `docs/watchlist-page-layout.md`（表格规范与列约定）与 `docs/stock-screener-page-design.md`（全站视觉规范 §3.4–§3.9）。
