# 接入 AI 页（/settings）UI 设计

> 范围：旧版 Web 应用「接入 AI」页 `frontend/src/pages/Settings.tsx`（运行于 `http://localhost:8901/settings`）。
> 原则：模型配置只存用户本地浏览器（`localStorage`），随提问发给你自己的后端去调模型；不上传、不进仓库。页面只负责「接哪家模型 / 怎么接」，不做任何行情或投资结论。
> 结构：页面定位（§一）→ 整体布局（§二）→ 子功能详解（§三）→ 保存与降级（§四）→ 数据存储（§五）→ 相关文件索引（§六）。
> 说明：布局与文案依据当前源码整理，非截图录入。

---

## 一、页面定位

- 路由 `/settings`，侧边栏「接入 AI」（`Settings` 图标，`Layout.tsx:34`）；内容区 `mx-auto max-w-6xl px-6 py-6`。
- 作用：配置一次，全站的「问 AI」「每日复盘 / 今日要点」「多空辩论」「反思审计」等所有 AI 功能复用同一份配置（`loadLlm()`）。
- 两种接入方式：**订阅接入**（调本机已登录 CLI，免 API key）与 **API 接入**（填自己的 OpenAI 兼容 key）。
- 另有「后端访问密钥（可选）」区块，对应后端公网部署时的 `VR_API_KEY`。
- 本页**不渲染 `Disclaimer`**：它是配置页而非分析展示页；合规声明体现在具体功能页与配置说明中。

---

## 二、UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│ [A] PageHeader  接入 AI                                        │
│   配置一次，全站的「问 AI」「复盘」都能用你自己的模型          │
├──────────────────────────────────────────────────────────────┤
│ [B] 本地存储提示条（绿）key 只存本地、不上传、不校准           │
├──────────────────────────────────────────────────────────────┤
│ [C] 方式选择  grid sm:grid-cols-2 gap-3                       │
│   ┌ 订阅接入 ✓┐            ┌ API 接入   ┐                      │
│   │ 调本机已登录 CLI…│     │ 粘贴 key… 现已可用 │               │
│   └────────────┘            └───────────┘                      │
├──────────────────────────────────────────────────────────────┤
│ [D] GlassCard（随 [C] 切换内容）                              │
│   订阅态：                                                    │
│     CLI 列表 grid sm:grid-cols-2（选中高亮 / 即将支持置灰）    │
│     [保存]  [清除]（已配置时）                                 │
│   API 态：                                                    │
│     选择模型 [ select ▾ ]                                     │
│     Base URL [__________________]                             │
│     Model    [__________________]                             │
│     API Key  [**********]                                     │
│     [保存（存本地）]  [清除]（已配置时）                       │
├──────────────────────────────────────────────────────────────┤
│ [E] GlassCard「后端访问密钥（可选）」                          │
│   [********** 与后端 VR_API_KEY 保持一致]  [保存]             │
└──────────────────────────────────────────────────────────────┘
```

- 方式卡为 `GlassCard onClick`：选中的 `ring-1 ring-primary/40`，未选中 `opacity-80`，右上角 `Check` 标记当前态。
- [B] 提示条：`border-success/25 bg-success/5`，`ShieldCheck` 图标，说明「API key 只存在你本地浏览器」。
- 所有输入框样式统一：`rounded-lg border border-border bg-black/20 px-3 py-2 text-sm`。

---

## 三、子功能详解

| 区块 | 子功能 | 展示内容与交互 | 布局 | 显示条件 |
|------|--------|----------------|------|----------|
| [A] | 页头 | 标题「接入 AI」+ 副标题 | 标题左 | 始终 |
| [B] | 本地存储提示 | 绿框说明 key 只存本地、仅提问时发给自己后端、不校准 | 整宽 | 始终 |
| [C1] | 订阅接入卡 | `Sparkles` +「订阅接入」+ 说明；点击 `setMode("subscription")` | 双列左 | 始终 |
| [C2] | API 接入卡 | `KeyRound` +「API 接入」+ 说明；点击 `setMode("api")` | 双列右 | 始终 |
| [D-sub] | 订阅内容 | 说明文案 + `subscriptionModels` 按钮网格（`Terminal` 图标 / 名称 / 描述 /「即将支持」标签 / 选中 `Check`）+ 保存 / 清除 | `GlassCard` 内 | `mode === "subscription"` |
| [D-api] | API 内容 | 模型 `select`（`apiModels`）+ Base URL + Model + API Key 输入 + 保存 / 清除 | `GlassCard` 内 | `mode === "api"` |
| [E] | 后端访问密钥 | `KeyRound` + 说明（仅后端设了 `VR_API_KEY` 才需填）+ 掩码输入 + 保存按钮 | 独立 `GlassCard`（`mt-4`） | 始终 |

**方式选择态**：

- `mode` 初值：已存配置且 `isCliProvider(existing.provider)` → `subscription`，否则 `api`。
- `cliId` / `apiId` / `baseURL` / `modelName` / `apiKey` 均以已存配置回填；未存时 API 默认取 `apiModels[0]` 及其 `PROVIDER_BASE`。

**API 模型下拉联动（`pickApiModel`）**：选择某个 `apiModels` 项 → 同时设 `apiId`、`modelName = id`、`baseURL = PROVIDER_BASE[provider] || ""`（豆包 / MiMo / 其它兼容端点的 baseURL 为空或需自填）。

**订阅列表**：`subscriptionModels` = `aiModels` 中 `provider` 以 `cli-` 开头者（Claude Code / Qwen Code / DeepSeek CLI / Codex / OpenCode / Cursor Agent / Kimi）。`comingSoon: true` 的按钮 `disabled` 且 `opacity-40`。

---

## 四、保存与降级

### 4.1 保存规则

| 动作 | 校验 | 成功提示 |
|------|------|----------|
| `saveApi()` | `baseURL` / `apiKey` / `modelName` 三者 `trim()` 后均非空，否则 `toast.error("请填完 Base URL、API Key、Model")` | 「已保存到本地，全站「问 AI / 复盘」现在可用」 |
| `saveSubscription()` | 选中项存在且非 `comingSoon`，否则 `toast.error("请选择一个可用的订阅（暂不支持标「即将支持」的）")` | 「已选「{name}」订阅，全站「问 AI / 复盘」将调用本机 {name}」 |
| `saveAccess()` | 无（可空 = 清除） | 有值「已保存后端访问密钥（存本地）」/ 空「已清除后端访问密钥」 |
| `forget()` | 无（清除模型配置） | 「已清除本地配置」，同时清空 `apiKey` / `cliId` |

- `providerOf(id)`：从 `apiModels` 查该模型 id 的 `provider`，查不到回落 `openai-compatible`。
- 保存后的配置形态：订阅 `{provider:"cli-*", baseURL:"", apiKey:"", model:id}`；API `{provider, baseURL, apiKey, model}`。

### 4.2 降级与失败态

| 场景 | 表现 |
|------|------|
| 必填缺失 | 顶部 `toast.error`，不写入存储 |
| 未配置就点「问 AI」 | 对应功能页调用 `chatStream` → `ApiError("尚未接入 AI，请先在「接入 AI」里配置", 400)` |
| 订阅档但本机未装 CLI | 功能页后端 `_check_llm` 返回 400「未检测到「{kind}」对应的本机命令…」 |
| 后端 401（开了 `VR_API_KEY`） | 功能页提示「后端开启了访问鉴权（VR_API_KEY）：请在「接入 AI」页底部填写后端访问密钥」 |
| 隐私模式 localStorage 不可用 | `storageSet/Remove` 静默兜底，配置无法持久化（刷新后回到未配置） |

- **密钥可见性**：API Key 与后端访问密钥输入框均为 `type="password"`；页面与提示均声明只存本地、不上传、不进仓库。
- **Token 优先级**：`api.ts#authHeaders()` 先用登录 token，其次才用这里的后端访问密钥。

---

## 五、数据存储

| 存储 key | 内容 | 读写 |
|----------|------|------|
| `vr-llm` | 用户模型配置 `LlmConfig{provider, baseURL, apiKey, model}` | `loadLlm` / `saveLlm` / `clearLlm`（`lib/llm.ts`） |
| `vr-access-key` | 后端访问密钥（`VR_API_KEY` 同值） | `loadAccessKey` / `saveAccessKey`（`lib/api.ts`） |

- `loadLlm()` 有效性判定：有 `model` 且（CLI provider 或 `baseURL && apiKey`）；不满足返回 `null`。
- 模型清单与各 provider 默认 baseURL 来自 `frontend/src/lib/ai-models.ts`（`aiModels` / `subscriptionModels` / `apiModels` / `PROVIDER_BASE`），为**静态清单**，不请求后端。
- 后端 `LLMConfig` 校验（`backend/app.py#_check_llm`）：缺 `model` → 400；CLI provider 未检测到本机命令 → 400；API provider 缺 `apiKey` 或 `baseURL` → 400。

---

## 六、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Settings.tsx` | 页面主体（方式选择、订阅 / API 表单、后端访问密钥） |
| `frontend/src/lib/llm.ts` | `loadLlm` / `saveLlm` / `clearLlm`（`vr-llm`）、`chatStream` |
| `frontend/src/lib/ai-models.ts` | `aiModels` / `subscriptionModels` / `apiModels` / `PROVIDER_BASE` / `isCliProvider` |
| `frontend/src/lib/api.ts` | `loadAccessKey` / `saveAccessKey`（`vr-access-key`）、`authHeaders`、401 处理 |
| `frontend/src/components/ui/PageHeader.tsx` | 页头 |
| `frontend/src/components/ui/GlassCard.tsx` | 方式卡 / 表单卡 / 访问密钥卡容器 |
| `frontend/src/router.tsx` | `/settings` 路由 |
| `backend/app.py` | `LLMConfig` / `_check_llm` 校验、`VR_API_KEY` 鉴权中间件 |
| `backend/.env.example` | `VR_API_KEY` / `VR_AUTH_USER` / `VR_AUTH_PASS` 示例 |
