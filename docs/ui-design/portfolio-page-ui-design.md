# 我的持仓页（/portfolio）UI 设计说明

> 范围：旧版 Web 应用（`frontend/` + `backend/`，`http://localhost:8901/portfolio`）。
> 目的：记录该页的布局、区块顺序、数据来源与状态处理，供后续改动对照。
> 页面文件：`frontend/src/pages/Portfolio.tsx`（337 行）。
> 依赖组件/模块：`PageHeader`、`GlassCard`、`AskAiButton`、`Disclaimer`、`StockCodeInput`、`lib/api.ts`、后端 `backend/portfolio.py`。
> 说明：该页是登录后的前端渲染页面，本文依据当前源码整理，非截图录入。

---

## 一、页面定位

- 「我的持仓」= 用户**自己录入**的持仓台账：存本地、不上传，叠加实时行情看浮动盈亏。
- 侧边栏「我的持仓」（`Wallet` 图标，`Layout.tsx:31`），`/portfolio` 路由（`router.tsx:28`）。
- 内容区沿用 `Layout` 默认宽度 `mx-auto max-w-6xl px-6 py-6`（仅 `/screener` 放宽到 `max-w-[1600px]`）。
- 区块顺序（自上而下）：页头 → 隐私提示条 → 汇总卡（有持仓才显示）→ 添加持仓 → 错误条（有错误才显示）→ 持仓明细 → 添加清仓记录 → 已清仓 → 免责声明。
- 定调：只把用户自己的账理清楚，不预置标的、不荐股、不预测；分析方向由用户接入的 AI 给出。

---

## 二、整体结构（自上而下，单列）

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ [A] 页头 PageHeader                                                                  │
│     我的持仓                                       [让 AI 看我的持仓]  [⟳ 刷新]       │
│     自己录、存在本地，实时看浮动盈亏                                                  │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [B] 隐私提示条（绿边/绿底）                                                          │
│     🛡 持仓只存在你本地，不上传、不进仓库。行情每半小时自动刷新，也可手动刷新……        │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [B2] 取数失败警告条（quote_failed > 0 才渲染，橙边/橙底）                             │
│     ⚠ 有 N 只持仓的行情未取到，已从市值 / 盈亏汇总中排除（不是 0 元，也不代表亏 100%）  │
│                                                                    [重试]            │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [C] 汇总卡（仅 totals 且至少一只持仓取到行情时渲染；行情全缺时不显示 0 值卡）  4 格 2/4 列│
│  ┌ 总市值 ┐ ┌ 总成本 ┐ ┌ 浮动盈亏 ┐ ┌ 盈亏比例 ┐                                     │
│  │ 1234.5 │ │ 1000.0 │ │ +234.5  │ │ +23.45% │                                      │
│  └────────┘ └────────┘ └─────────┘ └─────────┘                                      │
│     （有缺失时附一行：汇总已排除 N 只行情未取到的持仓。）                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [D] 添加持仓  GlassCard                                                              │
│     股票代码[6 位代码 / 名称，模糊下拉,浮层在最外层] 数量（股）[如 100] 成本价[如 12.5，可负]  [＋ 添加]│
│     注：同一代码再次添加会按加权平均成本合并（加仓）。                                 │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [E] 错误条（有 err 才渲染）：⚠ 错误文案                                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [F] 持仓明细  GlassCard glow                      更新于 yyyy-MM-dd HH:MM             │
│     表：名称（含代码）| 现价 | 数量 | 成本 | 市值 | 浮动盈亏 | 盈亏% | 🗑              │
│     行情未取到的行：现价/市值/盈亏显示「—」不显示 -100%，名称后标「行情未取到」         │
│     空态：还没有持仓记录，用上面的表单添加一笔。                                      │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [G] 添加清仓记录  GlassCard                                                          │
│     代码[6 位 / 名称，模糊下拉] 清仓日期[date] 清仓价[卖出价] 股数[如 100] 买入成本[可负]  [＋ 记录]│
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [H] 已清仓  小节头 +「已实现盈亏合计 ±n」（有清仓记录时）                             │
│     GlassCard 表：名称（含代码）| 清仓日期 | 清仓价 | 股数 | 成本 | 已实现盈亏 | 盈亏% | 🗑│
│     空态：还没有清仓记录。卖出后在上面记一笔，作为已实现盈亏的历史。                   │
├─────────────────────────────────────────────────────────────────────────────────────┤
│ [I] 免责声明 Disclaimer                                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

**区块间节奏**：全页单列堆叠，无侧栏、无 Tab；小节头 `h3` + 卡片 `mb-4/mb-6`，持仓明细用 `glow` 变体。

---

## 三、区域详解

### [A] 页头 `PageHeader`（`Portfolio.tsx:109-125`）

| 项 | 取值 |
|----|------|
| `title` | 我的持仓 |
| `subtitle` | 自己录、存在本地，实时看浮动盈亏 |
| `actions` | 两个控件，顺序固定 |

`actions` 从左到右：

1. **让 AI 看我的持仓**（`AskAiButton`）：**仅当 `holdings.length > 0` 时渲染**；`context` = 逐行拼出的持仓摘要（名称/代码/股数/成本/现价/浮盈/浮盈%，末尾附汇总市值与总浮盈；无持仓时为「我的持仓：暂无记录。」），预置问题 `我的持仓集中在哪些方向 / 结构上有什么风险 / 帮我梳理一下`。
2. **刷新**：`RefreshCw` 图标 +「刷新」，刷新中换 `Loader2` 转圈并禁用；点击 `load(true)` → `POST /api/portfolio/refresh`。

### [B] 隐私提示条（`:127-130`）

- 绿边绿底 `border-success/25 bg-success/5`，`ShieldCheck` 图标。
- 文案：持仓**只存在你本地**，不上传、不进仓库；行情每半小时自动刷新，也可手动刷新；本产品不提供标的、不给建议。

### [B2] 取数失败警告条（`:132-142`）

- **仅当 `quote_failed > 0` 时渲染**：橙边橙底 `border-warning/30 bg-warning/5`，`AlertCircle` 图标。
- 文案：有 N 只持仓的行情未取到，**已从市值 / 盈亏汇总中排除（不是 0 元，也不代表亏 100%）**；右侧「重试」按钮 = `load(true)`（刷新中禁用）。
- 目的：对齐个股页的取数失败出声——行情缺失单独提示，绝不静默、也不伪装成巨亏。

### [C] 汇总卡（`:144-165`）

- **仅当 `totals` 存在且至少一只持仓取到行情（`hasQuote`）时渲染**：空持仓、或行情全部缺取时都不显示 0 值卡（避免误导为"清零"）。
- `grid grid-cols-2 gap-3 sm:grid-cols-4`，四格固定：总市值 / 总成本 / 浮动盈亏 / 盈亏比例；数值口径见 §4.3（**只累计取到行情的持仓**）。
- 有缺失时卡片下方补一行浅色说明「汇总已排除 N 只行情未取到的持仓」。
- 数值 `fmt()`（千分位、最多 2 位小数）；正盈亏带 `+` 前缀；浮动盈亏与盈亏比例按 `pnl > 0 → text-danger`（红涨）/ `< 0 → text-success`（绿跌）着色。

### [D] 添加持仓（`:166-192`）

- 卡片标题「添加持仓」；表单为 `flex flex-wrap items-end` 的字段行 + 主按钮。
- **股票代码**：复用共享组件 `StockCodeInput`（`showAction={false}`，只保留输入框 + 模糊下拉），支持 6 位代码或**中文名称模糊搜索**；下拉经 **portal 渲染到 `document.body` + `position: fixed`**，永远浮在最外层（不受 `.glass` 层叠 / 卡片裁剪影响），选中/回车即回填 6 位代码并触发添加；`placeholder="6 位代码 / 名称"`，下拉宽 `dropdownWidth="20rem"`。
- 数量（股）与成本价仍为普通输入（成本允许负号）。
- 按钮「＋ 添加」：`onClick={() => add()}`，提交中 `Loader2` 并禁用。
- 注释：同一代码再次添加按加权平均成本合并（加仓）。
- **代码存在性校验（后端）**：提交后后端用 `astock.quote_probe(code)` 探测——腾讯明确无此证券（`no_match`，如 `601102`）→ `400`「未找到该代码的行情：该代码不存在或已退市」，前端错误条展示；网络异常（`unavailable`）**不拦**，交行情缺失提示处理。避免录入无效代码后长期显示「行情未取到」。

### [E] 错误条（`:194-198`）

- `err` 非空才渲染：`border-destructive/30 bg-destructive/5`，`AlertCircle` 图标 + 文案。
- 来源：加载失败、添加持仓失败、添加清仓失败、**删除持仓 / 删除清仓失败**（不再静默吞掉），或前端校验拦截。

### [F] 持仓明细（`:200-247`）

- `GlassCard glow`，头部左侧「持仓明细」，右侧 `data.updated` 非空时显示「更新于 …」。
- 表头：名称 / 现价 / 数量 / 成本 / 市值 / 浮动盈亏 / 盈亏% / （删除）。
- 单元格：名称 + 代码（代码浅色等宽）；现价与成本用 `fmtPx()`（最多 4 位小数，兼容 ETF/基金）；市值用 `fmt()`；浮动盈亏与盈亏% 按涨跌着色、正值带 `+`；行尾 `Trash2` 删除按钮。
- **行情未取到的行（`quote_ok=false`）**：现价 / 市值 / 浮动盈亏 / 盈亏% 一律显示「—」并用中性色（**不显示 0 或 -100%**），名称后追加「行情未取到」小标签。
- 空态：`holdings.length === 0` → 「还没有持仓记录，用上面的表单添加一笔。」
- 容器 `overflow-x-auto`，窄屏横向滚动。

### [G] 添加清仓记录（`:249-284`）

- 卡片标题「添加清仓记录」；表单为字段行 + 主按钮。
- **股票代码**：同样复用 `StockCodeInput`（`showAction={false}`，模糊搜索 + portal 下拉），`dropdownWidth="18rem"`。
- 输入：清仓日期（`<input type="date">`）、清仓价、股数、买入成本（可为负）。
- 按钮「＋ 记录」：`onClick={() => addClose()}`，提交中 `Loader2` 并禁用。

### [H] 已清仓（`:286-332`）

- 小节头「已清仓」（`text-sm font-semibold text-muted-foreground`）；右侧当 `closed.length > 0` 时显示「已实现盈亏合计 ±n」，按 `realized_pnl` 正负着色、带 `+` 前缀。
- `GlassCard` 表：名称 / 清仓日期 / 清仓价 / 股数 / 成本 / 已实现盈亏 / 盈亏% / （删除）。
- 现价/成本类用 `fmtPx()`，股数与金额用 `fmt()`；盈亏按正负着色。
- 删除按**数组下标** `i` 删除（`removeClosed(i)`）。
- 空态：`closed.length === 0` → 「还没有清仓记录。卖出后在上面记一笔，作为已实现盈亏的历史。」
- 容器 `overflow-x-auto`。

### [I] 免责声明 `Disclaimer`（`:334`）

- 通用组件：只呈现客观数据、不推荐个股、不预测涨跌、不构成投资建议；分析方向由用户配置的 AI 给出。

---

## 四、数据与状态

### 4.1 接口映射

| 区块 | 接口 | 说明 / 失败处理 |
|------|------|-----------------|
| 首次加载 | `GET /api/portfolio` | `pf.get_portfolio()`；失败置 `err` 并显示错误条 |
| [A] 刷新 | `POST /api/portfolio/refresh` | 重新叠加行情；失败置 `err` |
| [D] 添加持仓 | `POST /api/portfolio/holding` | body `{code,shares,cost}`；校验失败 400（含 **代码不存在/已退市** `no_match`）→ 错误条 |
| [F] 删除持仓 | `DELETE /api/portfolio/holding?code=` | 失败置 `err`（不再静默） |
| [G] 记录清仓 | `POST /api/portfolio/close` | body `{code,date,price,shares,cost}`；校验失败 400 → 错误条 |
| [H] 删除清仓 | `DELETE /api/portfolio/close?index=` | 按下标删除；失败置 `err`（不再静默） |

返回统一为 `{ data: PortfolioData }`；`PortfolioData = { holdings, totals{market_value,cost,pnl,pnl_pct}, closed, realized_pnl, updated, last_refresh, quote_failed }`（`lib/api.ts:236`）。`Holding` 含 `quote_ok`，行情缺失时 `price/market_value/pnl/pnl_pct` 均为 `null`。

### 4.2 刷新与加载态

- `load(manual)`（`:32-42`）：`manual` 走 `refreshPortfolio`，否则走 `portfolio`；失败置 `err`，`manual` 时开关 `refreshing`。
- 首次进入 `load()`，并每 `REFRESH_MS = 30 分钟` 自动 `load()`（`setInterval`，卸载时清除）。
- 后端另有 daemon 线程每 1800 秒刷新一次 `last_refresh` 时间戳（`portfolio.py#start_scheduler`）。
- 页面**无逐块加载骨架**：加载中不显示占位，直接以空表/空态呈现；手动刷新仅按钮转圈。

### 4.3 校验与计算口径

- **前端校验**（提交前）：代码 `/^\d{6}$/`；持仓数量 `> 0` 且成本为有限数；清仓需日期非空、价格与股数 `> 0`、成本有限。不满足则在错误条给出中文提示。
- **后端校验**：持仓/清仓代码必须 6 位数字、持仓数量 `> 0`、清仓价与股数 `> 0`、清仓日期 `YYYY-MM-DD`；**成本价允许正负**（融券 / 返息 / 摊薄等按结果计）。
- **加仓合并**：同代码 `cost = (旧股数×旧成本 + 新增股数×新成本) / 总股数`，保留 4 位小数（`portfolio.py:78`）。
- **行情有效判定**：`quote_ok = 行情源返回的现价存在且 > 0`；取不到（如本机 `601102` 返回空）时 `price=None`，**该行市值/盈亏一律为 `None`，且不计入 `totals`**，`quote_failed` 计数 +1。绝不按 0 元计算——否则会把取数失败渲染成 −100% 并污染汇总。
- **浮动盈亏**：`市值 = 现价×股数`，`成本额 = 成本×股数`，`浮盈 = 市值 − 成本额`，`浮盈% = 浮盈 ÷ 成本额 × 100`（成本额为 0 时取 0）；仅在 `quote_ok` 时计算。
- **已实现盈亏**：`(清仓价 − 成本) × 股数`；`盈亏% = (清仓价 − 成本) ÷ 成本 × 100`（成本为 0 时取 0）。
- 汇总 `totals` 只累计**取到行情**的持仓的市值/成本额；`realized_pnl` 为已清仓 `pnl` 之和；`quote_failed` 为行情缺失的持仓数。
- 格式化：`fmt = toLocaleString("zh-CN",{maximumFractionDigits:2})`；`fmtPx = 最多 4 位小数`；`pnlColor`：`>0 → text-danger`、`<0 → text-success`、`=0 → text-muted-foreground`。

### 4.4 存储位置

- 本地 JSON：`~/.vibe-research/portfolio.json`（可用环境变量 `VR_DATA_DIR` 覆盖目录），放仓库外，重新下载项目不丢数据。
- 写入原子：先写 `*.tmp` 再 `os.replace`；读用 `threading.Lock` 保护。
- 旧版本数据（`backend/.cache/portfolio.json`）首次启动自动复制迁移，旧文件保留作备份。

---

## 五、视觉规范（复用全站 token）

| 语义 | 取值 |
|------|------|
| 页面容器 | `Layout` 的 `mx-auto max-w-6xl px-6 py-6` |
| 卡片容器 | `GlassCard`；持仓明细用 `glow` 变体 |
| 表单输入 | `rounded-lg border border-border bg-black/20 px-3 py-2 text-sm`，聚焦 `focus:border-primary/50` |
| 主按钮 | `bg-primary/15 text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50` |
| 涨 / 跌 | `text-danger` / `text-success`（`+` 前缀） |
| 隐私 / 安全 | `border-success/25 bg-success/5` + `ShieldCheck` |
| 错误 | `border-destructive/30 bg-destructive/5` + `AlertCircle` |
| 表格 | `w-full text-sm`，表头 `text-xs text-muted-foreground` + `border-b border-border/50`，行 `border-b border-border/30`，容器 `overflow-x-auto` |

---

## 六、合规与降级要点

1. **本地优先**：持仓严格存本机（`~/.vibe-research/portfolio.json`），不上传、不进仓库，页首明文提示。
2. **不预置标的**：不内置任何推荐标的、无种子兜底；只展示用户录入的内容。
3. **取不到不编值**：行情取不到时该行现价/市值/盈亏显示「—」并标「行情未取到」，**不按 0 元计算、不显示 -100%**，且不计入汇总；页面顶部以取数失败警告条出声并给「重试」。
4. **无效代码在录入时拦截**：后端区分「腾讯明确无此证券（`no_match`）」与「网络异常（`unavailable`）」——前者 400 拒绝并提示「不存在或已退市」，后者不拦；不把偶发取数失败误判为废码（对齐 data-access skill §6 降级原则）。
4. **无投资建议**：页面只做账目与客观行情展示，分析方向交给用户自己接入的 AI；`Disclaimer` 兜底。

---

## 七、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Portfolio.tsx` | 页面主体（本页全部区块、表单与状态） |
| `frontend/src/components/layout/Layout.tsx` | 侧边栏 + 内容容器（`max-w-6xl`） |
| `frontend/src/router.tsx` | `/portfolio` 路由 |
| `frontend/src/components/ui/PageHeader.tsx` | 页头（标题 / 副标题 / actions 插槽） |
| `frontend/src/components/ui/GlassCard.tsx` | 玻璃卡片容器（`glass` / `glow`） |
| `frontend/src/components/ui/AskAiButton.tsx` | 「让 AI 看我的持仓」对话面板 |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/components/stock/StockCodeInput.tsx` | 代码 / 名称模糊搜索输入框（与个股/自选/复盘页共用；下拉 portal 到 body 浮在最外层） |
| `frontend/src/lib/api.ts` | `PortfolioData` 类型与 `portfolio*` 接口封装 |
| `backend/portfolio.py` | 持仓数据层：本地读写、加仓合并、盈亏计算、后台刷新 |
| `backend/app.py` | `/api/portfolio*` 路由与入参校验 |
