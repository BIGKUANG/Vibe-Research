# 板块详情页（/sectors/:key）UI 设计

> 范围：旧版 Web 应用板块详情页 `frontend/src/pages/SectorDetail.tsx`（运行于 `http://localhost:8901/sectors/:key`）。
> 原则：展示产业链**环节骨架**；已核实板块列环节，未核实板块如实标注「梳理中」并引导用户用自己的 AI 现场拆解；不给标的、不给方向。
> 结构：页面定位（§一）→ 整体布局（§二）→ 子功能详解（§三）→ 状态与「问 AI」（§四）→ 数据与降级（§五）→ 相关文件索引（§六）。
> 说明：布局与文案依据当前源码整理，非截图录入。

---

## 一、页面定位

- 路由 `/sectors/:key`，`useParams()` 取 `key`，从 `frontend/src/data/sectors.json` 里 `find(s => s.key === key)`。
- 入口：板块中心卡片点击；侧边栏「板块中心」下的 6 个常看板块快捷入口（`humanoid` / `ai-computing` / `hbm` / `cpo` / `business-space` / `ai-pharma`）。
- 内容区 `mx-auto max-w-6xl px-6 py-6`。
- 三种渲染形态：**未找到**（key 不存在）→ **已核实**（展示环节芯片）→ **未核实**（梳理中空态 + AI 引导）。

---

## 二、UI 布局

### 2.1 已核实（`sector.verified === true`）

```
┌──────────────────────────────────────────────────────────────┐
│ [A] ← 板块中心（返回链接）                                     │
│ [B] PageHeader                                                │
│   人形机器人                 [✨ 让 AI 拆这个板块]             │
│   tagline…                                                    │
├──────────────────────────────────────────────────────────────┤
│ [C] 核心环节（{n}）                                            │
│   ( 减速器 ) ( 丝杠 ) ( 伺服电机 ) ( 传感器 ) ( 灵巧手 ) ( … ) │
│   ＋ 想在某个环节挂上自己关注的标的？数据存在你本地…           │
├──────────────────────────────────────────────────────────────┤
│ [D] Disclaimer                                                │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 未核实（`sector.verified === false`）

```
┌──────────────────────────────────────────────────────────────┐
│ [A] ← 板块中心                                                │
│ [B] PageHeader  HBM                    [✨ 让 AI 拆这个板块]  │
│   tagline…                                                    │
├──────────────────────────────────────────────────────────────┤
│ [C'] GlassCard 空态                                           │
│      🔧（Wrench）                                              │
│   该板块的环节骨架尚在**实时核实**补全中（不靠模型记忆）——      │
│   已核实的板块见左侧。                                         │
│   也可以点右上角「让 AI 拆这个板块」，用你自己的 AI 按七维框架  │
│   当场梳理它的产业链。                                         │
├──────────────────────────────────────────────────────────────┤
│ [D] Disclaimer                                                │
└──────────────────────────────────────────────────────────────┘
```

### 2.3 未找到（key 不存在）

```
┌──────────────────────────────────────────────────────────────┐
│        未找到该板块。 返回板块中心（返回链接，主色）           │
└──────────────────────────────────────────────────────────────┘
```

---

## 三、子功能详解

| 区块 | 子功能 | 展示内容与交互 | 布局 | 显示条件 |
|------|--------|----------------|------|----------|
| [A] | 返回链接 | `ArrowLeft` + 「板块中心」→ `/sectors` | 顶部左 | 板块存在 |
| [B] | 页头 | 标题 = `sector.label`，副标题 = `sector.tagline`；右侧 `AskAiButton`（label「让 AI 拆这个板块」） | `PageHeader` 左右分布 | 板块存在 |
| [C] | 环节芯片 | `<h3>核心环节（{nodes.length}）</h3>` + `nodes.map` 渲染胶囊：`rounded-full border border-primary/40 bg-primary/15 … hover:bg-primary/25` | `flex flex-wrap gap-2.5` | `verified === true` |
| [C'] | 未核实空态 | `Wrench` 图标 + 说明文案（实时核实、不靠模型记忆 + AI 引导） | `GlassCard` 居中 | `verified === false` |
| [C-note] | 挂标的提示 | `Plus` + 「想在某个环节挂上自己关注的标的？数据存在你本地，不会上传、不进仓库。」 | 环节区下方小字 | `verified === true` |
| [D] | 免责声明 | `Disclaimer` 完整版 | 页脚 | 板块存在 |
| — | 未找到 | 居中提示 + 返回链接 | 居中 | `key` 不匹配任何板块 |

- **环节芯片当前不可点击**、不挂标的（无 `Link` / 无 `onClick`）；「挂标的」仅是一句提示，页面本身不提供该交互。
- `key` 非法 / 不存在时不渲染页头与 AI 按钮，只给返回入口。

---

## 四、状态与「问 AI」

### 4.1 AskAiButton

- 位置：页头 `actions`；点击从右侧滑出「问 AI · 本页上下文」面板（`AskAiButton.tsx`，`fixed inset-0 z-50` + `max-w-md` 侧栏）。
- 注入上下文（`aiContext`）：

```
板块：{sector.label}
定位：{sector.tagline}
产业链环节：{nodes.length ? nodes.join("、") : "（环节梳理中）"}
```

- 预设建议问题：`按七维框架拆解` / `这个板块的产业链地图` / `哪个环节卡脖子` / `有什么风险信号`。
- 对话按路由持久化：`localStorage["vr-askai-chat:/sectors/{key}"]`（每 key 一份，切板块即换对话并中止在跑请求）；上限 40 条。
- 未接入 AI 时面板显示本页上下文预览 + 跳转 `/settings` 的引导按钮。
- 结论由用户自己的模型给出，页脚 `Disclaimer` 兜底「不构成投资建议」。

### 4.2 状态汇总

| 状态 | 判定 | 表现 |
|------|------|------|
| 已核实 | `sector.verified` | 环节芯片 + 挂标的提示 |
| 未核实 | `!sector.verified` | 梳理中空态 + AI 引导 |
| 未找到 | `!sector` | 「未找到该板块。返回板块中心」 |

---

## 五、数据与降级

### 5.1 数据来源

- **本地静态 JSON**：`frontend/src/data/sectors.json`（与板块中心同源），构建时打包，**不请求后端**、无网络与加载态。
- 字段：`key` / `label` / `tagline` / `hot` / `verified` / `nodes`。
- `nodes` 为**环节名**（字符串数组），不是股票代码或标的；空数组配 `verified=false`。

### 5.2 降级与边界

- **无失败态**：静态数据不存在请求失败；非法 key 走「未找到」分支。
- **未核实板块**不是错误，而是如实标注「梳理中」，并给出「让 AI 当场拆」的替代路径（依赖用户已配置 AI）。
- **不产生投资动作**：页面只列产业环节与定位，不含标的、价位、方向；AI 面板结论由用户模型给出且受 `Disclaimer` 约束。
- **数据时效**：`sectors.json` 人工 / 脚本维护，无实时成分；「实时核实补全」是维护策略，非运行时行为。

---

## 六、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/SectorDetail.tsx` | 页面主体（返回、页头、环节 / 空态、免责条、`aiContext`） |
| `frontend/src/data/sectors.json` | 板块静态清单（环节来源） |
| `frontend/src/components/ui/AskAiButton.tsx` | 「让 AI 拆这个板块」侧栏对话（上下文注入、持久化、未接入引导） |
| `frontend/src/components/ui/PageHeader.tsx` | 页头（含 `actions` 槽） |
| `frontend/src/components/ui/GlassCard.tsx` | 未核实空态容器 |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/lib/llm.ts` | `chatStream` / `loadLlm`（AskAiButton 依赖） |
| `frontend/src/router.tsx` | `/sectors/:key` 路由 |
