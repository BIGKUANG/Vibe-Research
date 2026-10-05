# 研究记录页（/notes）UI 设计

> 范围：旧版 Web 应用研究记录页 `frontend/src/pages/Notes.tsx`（运行于 `http://localhost:8901/notes`）。
> 原则：把各页「存入沉淀」的 AI 结果**只存本地浏览器**（`localStorage`）随时回看；「反思审计」让用户自己的模型回头审这段推理，产出仍不构成投资建议。
> 结构：页面定位（§一）→ 整体布局（§二）→ 子功能详解（§三）→ 反思审计时序（§四）→ 数据与降级（§五）→ 相关文件索引（§六）。
> 说明：布局与文案依据当前源码整理，非截图录入。

---

## 一、页面定位

- 路由 `/notes`，侧边栏「研究记录」（`NotebookPen` 图标，`Layout.tsx:33`）；内容区 `mx-auto max-w-6xl px-6 py-6`。
- 本页是**本地沉淀的聚合视图**：其它页（每日复盘 / 今日要点 / 问 AI / 多空辩论）点「存入沉淀」后写入 `localStorage["vr-notes"]`，均在 `/notes` 集中展示与删除。
- 额外能力：对任一条记录发起「反思审计」（调用户自己的模型）→ 结果可再存为新记录（kind `反思审计`）。
- 定调：数据只存本地、不上传；页面只做记录整理与推理审计，不给投资结论。

---

## 二、UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│ [A] PageHeader                                                │
│   研究记录                          [🗑 清空]（有记录时）      │
│   把 AI 复盘 / 要点 / 问答沉淀在本地，随时回看。数据只存本地… │
├──────────────────────────────────────────────────────────────┤
│ [B] 记录列表  space-y-2                                       │
│   ┌ GlassCard(!p-0) ─────────────────────────────────────┐   │
│   │ ▸ [复盘] 每日复盘 2026-10-05            10-05 09:30 🗑 │   │
│   │   （展开后）                                           │   │
│   │   ┌ markdown 正文 ────────────────────────────────┐    │   │
│   │   │ …                                              │    │   │
│   │   └────────────────────────────────────────────────┘    │   │
│   │   ─────────────────────────────────────────────────     │   │
│   │   [🔍 反思审计]  让 AI 回头审这段推理：哪些有数据撑着…   │   │
│   │   （审计结果：紫框 markdown + [💾 把审计结果存为新记录]） │   │
│   └────────────────────────────────────────────────────────┘  │
│   …（全部记录，新记录置顶）                                    │
├──────────────────────────────────────────────────────────────┤
│ [C] 空态（无记录时）：📓 还没有记录。在「每日复盘」「资讯雷达」  │
│     或「问 AI」里点「存入沉淀」保存分析结果。                   │
├──────────────────────────────────────────────────────────────┤
│ [D] Disclaimer                                                 │
└──────────────────────────────────────────────────────────────┘
```

- 列表容器 `space-y-2`；每卡 `GlassCard className="!p-0 overflow-hidden"`（去内边距，行内自管 padding）。
- 折叠由 `openId` 单开控制：同一时刻最多展开一条。

---

## 三、子功能详解

| 区块 | 子功能 | 展示内容与交互 | 布局 | 显示条件 |
|------|--------|----------------|------|----------|
| [A] | 页头 | 标题「研究记录」+ 副标题；`actions` 为「清空」按钮 | `PageHeader` 左右 | 始终 |
| [A1] | 清空 | `Trash2` +「清空」，点击 `confirm("清空所有研究记录？")` → `clearNotes()` + `setNotes([])` | 页头右侧 | `notes.length > 0` |
| [B1] | 行头 | 折叠箭头（`ChevronDown`/`ChevronRight`）+ kind 徽标 + 标题（`truncate`）+ 时间（`MM-DD HH:mm`）+ 删除按钮 | `flex items-center gap-2 px-4 py-3` | 每条记录 |
| [B2] | 展开正文 | `ReactMarkdown + remarkGfm` 渲染 `n.content` | 行头下方 `border-t` 区 | `openId === n.id` |
| [B3] | 反思审计按钮 | `ScanSearch` +「反思审计」/「审计中…」；点击 `runReflect(n)` | 正文下方工具行 | 展开时 |
| [B4] | 审计结果 | 紫框（`border-violet-500/30 bg-violet-500/[0.05]`）内 markdown 流式渲染；出错显示红色文案 | 工具行下方 | 本行已发起审计且（有文本或错误） |
| [B5] | 存为记录 | `Save` +「把审计结果存为新记录」/「已存为新记录」；点击 `saveReflection(n)` | 审计结果底部 | 审计完成且未保存 |
| [C] | 空态 | `NotebookPen` + 引导文案 | 居中卡片 | `notes.length === 0` |
| [D] | 免责声明 | `Disclaimer` 完整版 | 页脚 | 始终 |

**kind 配色（`KIND_COLOR`）**：

| kind | 来源页 | 徽标色 |
|------|--------|--------|
| 复盘 | 每日复盘 | `bg-primary/15 text-primary` |
| 今日要点 | 资讯雷达 / 每日要点 | `bg-warning/15 text-warning` |
| 问AI | 各页「问 AI」 | `bg-success/15 text-success` |
| 多空辩论 | 多空辩论 | `bg-sky-500/15 text-sky-400` |
| 反思审计 | 本页审计结果 | `bg-violet-500/15 text-violet-400` |
| 其它 | — | `bg-muted/50 text-muted-foreground` |

**时间格式**：`new Date(ts).toLocaleString("zh-CN", { month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" })`（如 `10-05 09:30`）。

---

## 四、反思审计时序

1. 点击「反思审计」→ `runReflect(n)`：先 `abortRef.current?.abort()` 中止上一次审计，新建 `AbortController`。
2. 置 `reflectId = n.id`、清空 `reflectText` / `reflectErr` / `reflectSaved`、`reflecting = true`。
3. `reflectStream(n.content, n.title, { onDelta, onError }, ctrl.signal)` → `POST /api/reflect`（NDJSON：`status` / `delta` / `done` / `error`）。
4. `onDelta` 逐块追加到 `reflectText`（流式显示）；`onError` 写 `reflectErr`。
5. 完成：`reflecting = false`，出现「把审计结果存为新记录」。
6. 点击存为记录：`addNote("反思审计", "反思 · {原标题}", reflectText)` → 新记录置顶，`reflectSaved = true`。
7. 中止：捕获 `AbortError`（`DOMException.name === "AbortError"`）不报错；其它异常显示 `ApiError.message` 或 `String(e)`。

- **只保留当前一条**：`reflectText` / `reflectErr` 是单份 state，避免多条长文同时挂在页面。
- **未接入 AI**：`requireLlm()` 抛 `ApiError("尚未接入 AI，请先在「接入 AI」里配置", 400)`（`agents.ts`），审计区显示该文案。
- **一次只审一条**：`reflecting` 期间按钮 `disabled`；未展开的记录不显示审计工具行。

---

## 五、数据与降级

### 5.1 本地存储（`frontend/src/lib/notes.ts`）

- key `vr-notes`，值为 `Note[]` JSON；`Note = { id, kind, title, content, ts }`。
- `addNote`：新记录**置顶**（`[note, ...loadNotes()]`），最多保留 `MAX = 200` 条（`slice(0, MAX)`）。
- `deleteNote(id)` / `clearNotes()`：删除单条 / 移除整个 key。
- 写入统一走 `storageSet`（隐私模式等 `localStorage` 不可用时静默兜底）；读取 JSON 非法时 `loadNotes()` 返回 `[]`，不抛错。
- 数据**不上传、不进仓库**，清浏览器数据即丢失。

### 5.2 反思审计后端（`backend/app.py` + `backend/reflection.py`）

- `POST /api/reflect`（`ReflectReq{source, title, llm}`）：`source` 为空 → 400；`_check_llm(req.llm)` 校验模型配置（缺 model / 缺 baseURL+key / CLI 未检测到 → 400）。
- 审计系统提示词（`REFLECT_PROMPT`）固定五块输出：① 有数据支撑的部分 ② 缺乏支撑的部分 ③ 数据使用问题 ④ 最脆弱的一环 ⑤ 验证清单；硬性要求不给投资判断 / 买卖建议 / 目标价 / 评级。
- 待审文本上限 `MAX_SOURCE_CHARS = 12000`，超出截断（避免反思吃光上下文）。
- 事件流 `_ndjson`：运行时异常转成流内 `error` 事件，不中断连接。

### 5.3 页面失败 / 空态

| 场景 | 表现 |
|------|------|
| 无任何记录 | 空态卡引导去各页点「存入沉淀」 |
| 未接入 AI 就点审计 | 审计区红字「尚未接入 AI，请先在「接入 AI」里配置」 |
| 审计网络 / 后端错误 | 审计区红字显示 `ApiError.message` 或原始错误 |
| 后端 401（开了鉴权） | 审计区提示填写后端访问密钥（由 `lib/llm.ts` 401 分支给出） |
| 审计中途再点 / 切记录 | 上一次请求被 `abort`，不提示错误 |

---

## 六、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Notes.tsx` | 页面主体（列表、折叠、删除、清空、反思审计、存为记录） |
| `frontend/src/lib/notes.ts` | `Note` 类型、`loadNotes` / `addNote` / `deleteNote` / `clearNotes`（`vr-notes`） |
| `frontend/src/lib/agents.ts` | `reflectStream`（`POST /api/reflect` NDJSON）、`requireLlm` |
| `frontend/src/lib/llm.ts` | 读取用户模型配置、401 提示 |
| `frontend/src/lib/api.ts` | `ApiError`、`authHeaders` |
| `frontend/src/components/ui/PageHeader.tsx` | 页头（含「清空」actions） |
| `frontend/src/components/ui/GlassCard.tsx` | 记录卡 / 空态容器 |
| `frontend/src/components/ui/Disclaimer.tsx` | 合规免责条 |
| `frontend/src/router.tsx` | `/notes` 路由 |
| `backend/app.py` | `POST /api/reflect`、`_check_llm`、`_ndjson` |
| `backend/reflection.py` | `REFLECT_PROMPT`（五块）、`run_reflection_stream`、`MAX_SOURCE_CHARS` |
