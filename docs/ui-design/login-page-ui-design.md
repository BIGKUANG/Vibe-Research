# 登录页（/login）UI 设计

> 范围：旧版 Web 应用登录页 `frontend/src/pages/Login.tsx`（运行于 `http://localhost:8901/login`）。
> 原则：登录只做「本机账户校验」，凭据由后端 `VR_AUTH_USER` / `VR_AUTH_PASS` 提供，前端不写死任何账号；登录成功后的 token 只存本地浏览器。
> 结构：页面定位（§一）→ 整体布局（§二）→ 子功能详解（§三）→ 交互与状态（§四）→ 数据与降级（§五）→ 相关文件索引（§六）。
> 说明：布局与文案依据当前源码整理，非截图录入。

---

## 一、页面定位

- 路由 `/login`，**独立于 `Layout`**（无侧边栏、无内容容器）：`router.tsx` 把它与受保护路由并列，不在 `ProtectedRoute` 内。
- 受保护路由（`/`、`/daily-review`、`/intel`、`/sectors`、`/portfolio`、`/stock-data`、`/debate`、`/watchlist`、`/screener`、`/my-reports`、`/notes`、`/settings`）由 `ProtectedRoute` 守卫：未登录（无 token）时 `<Navigate to="/login" replace />`。
- 触发方式：直接访问 `/login`；或任一受保护页在未登录 / token 失效（后端返回 401）时被 `api.ts` 重定向至此。
- 定调：品牌页 + 单一登录表单；页脚标注「不荐股 · 不预测 · 无倾向」。

---

## 二、UI 布局

```
┌──────────────────────────────────────────────────────────────┐
│                  （整屏垂直+水平居中，桌面/移动同构）           │
│                                                              │
│   ┌────────────── GlassCard（max-w-sm，glow）─────────────┐   │
│   │                [A] 品牌区                             │   │
│   │        [LineChart 图标 10×10 主色发光]                │   │
│   │        Vibe-Research（Vibe- 常规 + Research 主色）    │   │
│   │        个人 AI 投研系统                                │   │
│   │                                                       │   │
│   │  [B] 错误条（仅出错时）：⚠ + 文案                     │   │
│   │                                                       │   │
│   │  [C] 表单                                             │   │
│   │   用户名  [____________________]                      │   │
│   │   密码    [____________________] 👁                     │   │
│   │                                                       │   │
│   │  [D] 主按钮  [ 登  录 ] / [⟳ 登录中…]                 │   │
│   │                                                       │   │
│   │  [E] 页脚  不荐股 · 不预测 · 无倾向                   │   │
│   └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

- 外层：`flex min-h-screen items-center justify-center bg-background p-4`。
- 卡片：`GlassCard glow className="w-full max-w-sm"`，表单 `flex flex-col items-center gap-6`。
- 移动端与桌面同构（单卡片居中），无断点分栏。

---

## 三、子功能详解

| 区块 | 子功能 | 展示内容与交互 | 布局 | 显示条件 |
|------|--------|----------------|------|----------|
| [A] | 品牌区 | `LineChart` 图标（`h-10 w-10 text-primary text-glow`）+ 标题 `Vibe-Research` + 副标题「个人 AI 投研系统」 | 垂直居中 | 始终 |
| [B] | 错误条 | `AlertCircle` 图标 + 文案；样式 `border-destructive/30 bg-destructive/5 text-destructive` | 表单上方整宽 | `err` 非空 |
| [C1] | 用户名 | 受控 `input`，`autoFocus`、`autoComplete="username"`；回车触发登录 | 标签 + 输入框 | 始终 |
| [C2] | 密码 | `type` 随 `showPw` 切换 text/password；右侧眼睛按钮切换明文，`tabIndex={-1}`；`autoComplete="current-password"`；回车触发登录 | 标签 + 相对定位输入框 + 右内嵌按钮 | 始终 |
| [D] | 主按钮 | 未提交「登  录」；提交中 `Loader2` 旋转 + 「登录中…」并 `disabled` | 整宽 | 始终 |
| [E] | 页脚标语 | 「不荐股 · 不预测 · 无倾向」小字 | 表单底部 | 始终 |

- **前端校验**：用户名 `trim()` 后为空或密码为空 → `err = "请输入用户名和密码"`，不发请求。
- **回车提交**：`handleKeyDown` 在用户名 / 密码输入框内监听 `Enter` → `handleLogin()`。

---

## 四、交互与状态

### 4.1 登录时序

1. 用户提交（表单 `onSubmit` 或输入框回车）。
2. 前端校验非空；通过后 `setBusy(true)` 并调用 `useAuth().login(username.trim(), password)`。
3. `login()` 调 `api.login()` → `POST /api/auth/login`（body `{username, password}`）。
4. 后端校验通过返回 `{token, expires_in: 86400}`；`AuthProvider` 把 token 存入 state → 写入 `localStorage["vr-auth-token"]`。
5. 成功：`navigate("/daily-review", { replace: true })`。
6. 失败：`setErr(...)`，`finally` 复位 `busy`。

### 4.2 状态

| 状态 | 表现 |
|------|------|
| `busy=false` | 按钮可点，文案「登  录」 |
| `busy=true` | 按钮禁用、显示 spinner +「登录中…」 |
| `showPw` | 控制密码明文 / 掩码（`Eye` / `EyeOff`） |
| `err` | 表单上方错误条；再次输入或提交时清空（`setErr(null)`） |

### 4.3 token 生命周期

- `AuthProvider` 初始化时 `loadToken()` 读 `localStorage["vr-auth-token"]`；存在即视为已登录（`isAuthenticated = !!token`），`loading` 初始为 true，`useEffect` 立即置 false（不做远端校验，过期由后端 401 兜底）。
- `api.ts#authHeaders()` 优先用登录 token（`Bearer <token>`），其次用后端访问密钥 `localStorage["vr-access-key"]`。
- 任一请求返回 401 → `api.ts` 清除 `vr-auth-token` 并 `window.location.href = "/login"`，同时抛 `ApiError("登录已过期，请重新登录", 401)`。
- 后端进程重启会刷新 `_AUTH_SECRET`，此前签发的 token 全部失效（表现即 401 → 重新登录）。

---

## 五、数据与降级

### 5.1 后端契约（`backend/app.py`）

- `POST /api/auth/login`（放行路由，无需 token）：`LoginReq{username, password}`。
  - 未配置 `VR_AUTH_USER` → **503** `{detail:"未配置登录账户（VR_AUTH_USER）"}`。
  - 用户名或密码错误 → **401** `{detail:"用户名或密码错误"}`。
  - 成功 → `{token, expires_in:86400}`；token = base64(`{u,t}:HMAC-SHA256(payload, _AUTH_SECRET)`)。
- 鉴权中间件 `_require_auth`：**仅当后端设置了 `VR_AUTH_PASS`** 时生效，对 `/api/*`（除 `_AUTH_SKIP = {"/api/auth/login","/api/health"}` 与非 OPTIONS）要求 `Authorization: Bearer <token>` 且 HMAC 校验通过，否则 401。

### 5.2 页面失败态

| 场景 | 文案 / 行为 |
|------|-------------|
| 用户名或密码为空 | 错误条「请输入用户名和密码」（不发请求） |
| 后端未启动 / 网络不可达 | `ApiError("连接不到后端，请先启动 backend（uvicorn app:app --port 8900）", 0)` |
| 后端未配置账户（503） | 错误条显示后端 `detail`（「未配置登录账户（VR_AUTH_USER）」） |
| 用户名或密码错误（401） | 错误条「用户名或密码错误」 |
| 其它 `ApiError` | 显示 `e.message`；非 `ApiError` 显示「登录失败，请检查后端是否启动」 |

- **本地开发免登录**：后端不设 `VR_AUTH_PASS` 时 `_require_auth` 不拦截，但前端 `ProtectedRoute` 仍要求本地存在 token；因此无账户配置时页面会停在登录页并提示 503，需配置 `.env` 的 `VR_AUTH_USER` / `VR_AUTH_PASS`。

### 5.3 安全边界

- 账号密码只从后端环境变量读取，前端不硬编码、不落盘；token 仅存本地 `localStorage`，不上传、不进仓库。
- 隐私模式下 `localStorage` 不可用由 `try/catch` 静默兜底（登录态无法持久化）。

---

## 六、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/Login.tsx` | 页面主体（品牌区、表单、错误条、提交） |
| `frontend/src/components/auth/AuthProvider.tsx` | `login` / `logout` / token 存取、`useAuth` |
| `frontend/src/components/auth/ProtectedRoute.tsx` | 受保护路由守卫（未登录跳 `/login`） |
| `frontend/src/lib/api.ts` | `api.login`、`authHeaders`、401 重定向、`ApiError` |
| `frontend/src/components/ui/GlassCard.tsx` | 登录卡片容器 |
| `frontend/src/router.tsx` | `/login` 路由与受保护子路由 |
| `backend/app.py` | `POST /api/auth/login`、`_verify_token`、`_require_auth` 中间件 |
| `backend/.env.example` | `VR_AUTH_USER` / `VR_AUTH_PASS` / `VR_API_KEY` 示例 |
