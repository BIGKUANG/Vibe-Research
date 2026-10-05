# 板块中心页（/sectors）UI 设计

> 范围：旧版 Web 应用板块中心页 `frontend/src/pages/Sectors.tsx`（运行于 `http://localhost:8901/sectors`）。
> 原则：只呈现**产业链环节骨架**（「只有环节，不含标的」），不列个股、不给方向；数据全部来自本地静态清单 `frontend/src/data/sectors.json`。
> 结构：页面定位（§一）→ 整体布局（§二）→ 子功能详解（§三）→ 数据与降级（§四）→ 相关文件索引（§五）。
> 说明：布局与文案依据当前源码整理，非截图录入。

---

## 一、页面定位

- 路由 `/sectors`，侧边栏「板块中心」（`LayoutGrid` 图标，`Layout.tsx:26`）；内容区 `mx-auto max-w-6xl px-6 py-6`（`Layout` 默认宽度）。
- 作用：把常见热门赛道的**产业链环节（nodes）**列出来，作为后续「板块详情 / 个股 / 问 AI」的入口；卡片点击进入 `/sectors/:key`。
- 侧边栏在「板块中心」下方另挂 6 个常看板块快捷入口（缩进）：人形机器人、AI 算力、HBM、光互联、商业航天、生物医药（`Layout.tsx#SECTOR_LINKS`），直达对应详情页。
- 定调：只列环节不列标的；不含买卖建议，页脚 `Disclaimer` 兜底。

---

## 二、UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│ [A] PageHeader                                                │
│   板块中心                                                     │
│   {N} 个热门赛道的产业链骨架 · 只有环节，不含标的               │
├──────────────────────────────────────────────────────────────┤
│ [B] 卡片网格   grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4│
│   ┌────────────┐ ┌────────────┐ ┌────────────┐               │
│   │ 人形机器人🔥│ │ AI 算力 🔥 │ │ HBM  🔥    │  …19 张        │
│   │ tagline…    │ │ tagline…   │ │ tagline…   │               │
│   │ ───────────│ │            │ │            │               │
│   │ 6 个环节 > │ │ 7 个环节 > │ │ 环节梳理中>│               │
│   └────────────┘ └────────────┘ └────────────┘               │
├──────────────────────────────────────────────────────────────┤
│ [C] 统计行  共 {N} 个板块，其中 {H} 个热门 · 环节持续实时核实补全│
├──────────────────────────────────────────────────────────────┤
│ [D] Disclaimer（中立免责条）                                   │
└──────────────────────────────────────────────────────────────┘
```

- 每张卡是一个 `<Link to={/sectors/${s.key}}>` 包 `GlassCard`（`glow={s.hot}`，`h-full` 撑满网格行高，`flex flex-col justify-between` 让底部信息贴底）。
- 卡片悬停：`GlassCard` 在有 `onClick` 时上浮（此处由外层 `Link` 承载点击，卡片本体不加 `onClick`）。

---

## 三、子功能详解

| 区块 | 子功能 | 展示内容与交互 | 布局 | 显示条件 |
|------|--------|----------------|------|----------|
| [A] | 页头 | 标题「板块中心」+ 副标题 `${sectors.length} 个热门赛道的产业链骨架 · 只有环节，不含标的` | 标题左 | 始终 |
| [B] | 板块卡片 | 卡片名 = `s.label`；`s.hot` 时显示 `Flame` +「热门」徽标；`s.tagline` 一句话定位；底部左侧 = `s.verified ? "{nodes.length} 个环节" : "环节梳理中"`，右侧 `ChevronRight` | 响应式网格 1/2/3 列 | 始终（遍历全部） |
| [B-hover] | 卡片跳转 | 整卡 `Link` → `/sectors/{s.key}` | — | 始终 |
| [C] | 统计行 | `共 {sectors.length} 个板块，其中 {hotCount} 个热门 · 环节持续实时核实补全` | 居中 | 始终 |
| [D] | 免责声明 | `Disclaimer` 完整版（只呈现事实、不推荐个股） | 页脚 | 始终 |

**卡片底部语义**：

- `verified === true` → 显示真实环节数 `${nodes.length} 个环节`，卡片 `glow` 仅在 `hot` 时点亮。
- `verified === false` → 显示「环节梳理中」，进入详情页后走未核实态（见 `sector-detail-page-ui-design.md`）。
- `hot` 与 `verified` 相互独立：热门不等于已核实（如 HBM / 光互联 `hot=true` 但 `verified=false`）。

---

## 四、数据与降级

### 4.1 数据来源

- **本地静态 JSON**：`frontend/src/data/sectors.json`，构建时打包进前端，**不请求后端**、无网络依赖。
- 字段结构（`sectors[]`）：`key`（URL 片段）、`label`（显示名）、`tagline`（一句话定位）、`hot`（热门标记）、`verified`（环节是否已核实）、`nodes`（环节名数组，未核实时为空数组）。
- 当前清单规模（以仓库内数据为准）：19 个板块，其中 14 个 `hot`、2 个 `verified`（人形机器人 6 环节、AI 算力 7 环节）。

### 4.2 降级与边界

- **无加载态 / 无失败态**：数据在打包期固化，不存在请求失败；JSON 缺失或结构不合法会在构建 / 运行时直接暴露（页面不做防御性兜底）。
- **无空态**：清单一经打包即恒定；若未来为空数组，网格渲染 0 张卡、统计行显示「共 0 个板块」。
- **数据时效**：`sectors.json` 由人工 / 脚本维护，页面**不提供实时行情与标的**；「环节持续实时核实补全」是维护承诺，不是运行时行为。
- **与「问 AI」的关系**：本页无 `AskAiButton`；AI 拆解入口在详情页（`/sectors/:key`）。

---

## 五、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Sectors.tsx` | 页面主体（页头、卡片网格、统计行、免责条） |
| `frontend/src/data/sectors.json` | 板块静态清单（key/label/tagline/hot/verified/nodes） |
| `frontend/src/components/ui/PageHeader.tsx` | 页头 |
| `frontend/src/components/ui/GlassCard.tsx` | 卡片容器（`glow` 高亮热门） |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/components/layout/Layout.tsx` | 侧边栏「板块中心」+ 6 个常看板块快捷入口 |
| `frontend/src/router.tsx` | `/sectors` 与 `/sectors/:key` 路由 |
