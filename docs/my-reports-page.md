# 我的研报页（/my-reports）功能说明

> 范围：旧版 Web 应用（`frontend/` + `backend/`，`http://localhost:8901/my-reports`）。
> 页面文件：`frontend/src/pages/MyReports.tsx`（192 行）；后端：`backend/myreports.py`（181 行）+ `backend/app.py:330-363`。
> 一句话：把你收集的研报文件**拖进来归档**，按文件名自动打行业标签，支持下载与删除。**文件只落本机磁盘，不上传、不进任何仓库。**

---

## 一、页面定位与入口

| 项 | 值 |
|----|----|
| 路由 | `/my-reports`（`frontend/src/router.tsx:33`） |
| 侧边栏 | 「我的研报」，`FileText` 图标，位于「我的持仓」之下、「研究记录」之上（`Layout.tsx:32`） |
| 定位 | 用户**私有资料库**：外部研报（券商 PDF、Word、表格、图片）的本地归档 + 自动分类 + 取回 |
| 与其它页的区别 | 「研究记录」(`/notes`) 存**自己产出的** AI 复盘 / 问答（浏览器 `localStorage`）；「我的研报」存**外部收集的研报文件**（本机磁盘目录），二者互不相干 |

---

## 二、页面布局（自上而下，单列）

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [A] 页头 PageHeader                                                          │
│     我的研报                                                                  │
│     把自己的研报拖进来归档，自动按行业分类。文件只存在本地部署目录、不上传、不进任何仓库。│
├──────────────────────────────────────────────────────────────────────────────┤
│ [B] 上传卡 GlassCard（mb-4）                                                  │
│     ┌──────────────────────────────────────────────────────────────────┐     │
│     │                    ⬆  Upload 图标                                  │     │
│     │        把研报拖到这里，或点击选择文件                                │     │
│     │   支持 PDF / Word / txt / md / 表格 / 图片，单个 ≤ 25MB，可一次多选   │     │
│     └──────────────────────────────────────────────────────────────────┘     │
│       （虚线上传区：默认 border-border，拖入时 border-primary + bg-primary/10）│
│       （上传中：图标换成 Loader2 转圈，文案变「上传中…」）                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ [C] 错误条（仅有错时）：红框 + 文案（加载 / 上传 / 删除 / 下载失败）            │
├──────────────────────────────────────────────────────────────────────────────┤
│ [D] 研报列表（按行业分组，组内按上传时间倒序）                                  │
│   ┌ GlassCard ── [人形机器人] 3 份 ──────────────────────────────────────┐   │
│   │ 📄 某券商_人形机器人深度.pdf        821KB · 2026/09/18    [⬇下载] [🗑删除] │   │
│   │ 📄 谐波减速器行业报告.docx          1.2MB · 2026/09/17    [⬇下载] [🗑删除] │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│   ┌ GlassCard ── [未分类] 1 份 ────────────────────────────────────────┐   │
│   │ …                                                                     │   │
│   └──────────────────────────────────────────────────────────────────────┘   │
│   （空态：FolderOpen 图标 + 「还没有归档的研报。把你收集的研报拖进上面的框，会自动按行业分好类。」）│
├──────────────────────────────────────────────────────────────────────────────┤
│ [E] 免责声明 Disclaimer                                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

容器沿用 `Layout` 的 `mx-auto max-w-6xl px-6 py-6`。

---

## 三、区域与交互详解

### [A] 页头（`MyReports.tsx:86-89`）

- `PageHeader`：标题「我的研报」，副标题「把自己的研报拖进来归档，自动按行业分类。文件只存在本地部署目录、不上传、不进任何仓库。」
- 无右侧 actions。

### [B] 上传区（`MyReports.tsx:92-133`）

两种方式并存：

1. **拖拽**：`onDragOver` → `drag=true`（虚线框转主色 + 淡主色底）；`onDragLeave` 复位；`onDrop` 取 `e.dataTransfer.files` 交给 `upload()`。
2. **点击选择**：整块区域 `onClick` 触发隐藏的 `<input type="file">`（`multiple`），`onChange` 后立即把 `input.value` 清空（保证同一文件能再次选择）。

| 项 | 取值 |
|----|------|
| `accept` | `.pdf,.doc,.docx,.txt,.md,.markdown,.csv,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp` |
| 多选 | 支持（`multiple` + 前端 for 循环逐个上传） |
| 单文件上限 | 25MB（前端文案提示，后端强制校验） |
| 上传中 | `busy=true`：图标替换为 `Loader2` 转圈，文案变「上传中…」；期间无禁用遮罩，可重复触发（无并发保护） |

**前端上传流程**（`MyReports.tsx:41-55`）：

```
upload(files)
 └ for each file:
     fileToB64(file)            // FileReader.readAsDataURL → data:...;base64,xxxx
     await api.uploadReport(name, b64)   // POST /api/myreports {name, content_b64}
 └ await load()                 // 重新拉列表，按新数据整体刷新
```

- 串行逐个上传；**任一文件失败即抛错中止，后续文件不再上传**（错误条显示「上传失败」或后端 400 的具体原因）。
- `fileToB64`（`:15-21`）产出的是完整 dataURL，后端负责剥掉 `data:` 前缀。

### [C] 错误条（`MyReports.tsx:135-139`）

- `err` 非空时显示：`border-destructive/30 bg-destructive/5 text-destructive` 的红框文案。
- 来源：列表加载失败、上传失败（后端 `ReportError` → HTTP 400，如类型不支持 / 文件过大 / 解码失败）、删除失败、下载失败。**不静默吞错。**

### [D] 研报列表（`MyReports.tsx:141-187`）

- 数据加载：`useEffect` 挂载时 `api.myReports()` → `GET /api/myreports`，返回 `MyReport[]`（`{ id, name, industry, size, ext, ts }`）。
- 空态：`FolderOpen` 图标 + 引导文案。
- **分组规则**（`useMemo`，`:75-82`）：按 `industry` 分桶 → 「未分类」固定排最后，其余按**条数多 → 少**排序；组内顺序沿用接口返回（`ts` 倒序）。
- 组头：主色小标签显示行业名 + 「N 份」。
- 每条一行（`divide-y divide-border/30`）：
  - 左：`FileText` 图标 + 文件名（`truncate`）+ 副行 `大小 · 上传日期`。
  - `fmtSize`（`:9-10`）：`<1KB` 显示 `B`、`<1MB` 显示 `KB`（取整）、否则 `MB`（一位小数）。
  - `fmtDate`（`:11-12`）：`zh-CN` 的 `yyyy/mm/dd`。
  - 右侧两个图标按钮：**下载**（`Download`，悬停转主色）、**删除**（`Trash2`，悬停转危险色）。
- 删除（`:57-65`）：`confirm("删除「{name}」？（同时从本地归档目录移除）")` → `DELETE /api/myreports/{id}` → 重新拉列表。
- 下载（`:67-73` + `lib/api.ts:48-60`）：**不能用 `<a download>`**（带不上 `Authorization` 头），改为带鉴权 `fetch` 取 blob → `URL.createObjectURL` → 临时 `<a download>` 触发浏览器保存 → 释放 URL。
- 分页 / 搜索 / 重命名：**当前没有**，全部平铺渲染。

### [E] 免责声明（`MyReports.tsx:189`）

- 通用 `Disclaimer`：只客观呈现公开数据与用户自有资料，不推荐、不预测、不构成投资建议。

---

## 四、后端接口（`backend/app.py:337-363`）

| 方法 | 路径 | 作用 | 关键返回 / 错误 |
|------|------|------|------------------|
| GET | `/api/myreports` | 列出全部研报元数据（按 `ts` 倒序） | `{ data: MyReport[] }` |
| POST | `/api/myreports` | 上传一份（JSON：`{ name, content_b64 }`） | 成功 `{ data: meta }`；校验失败 HTTP 400 + 中文原因 |
| GET | `/api/myreports/file/{id}` | 下载 / 预览原文件 | `FileResponse(path, filename=原文件名)`；不存在 404「研报不存在」 |
| DELETE | `/api/myreports/{id}` | 删除文件 + 移除索引 | `{ data: { ok: bool } }`（未命中返回 `ok: false`） |

- 鉴权：与全站一致 —— 设置 `VR_AUTH_USER` / `VR_AUTH_PASS`（或 `VR_API_KEY`）后，`/api/*` 需带 `Authorization: Bearer <token>`（`backend/app.py:161-172`）；前端由 `lib/api.ts#authHeaders()` 自动附带。
- 上传不用 `multipart/form-data`，而是 **base64 JSON**：避免引入 `python-multipart` 依赖，契合本项目「秒装必可用」的取舍（`myreports.py:4` 注释）。

---

## 五、数据存储在哪里

### 5.1 目录

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `VR_REPORTS_DIR` | `$VR_DATA_DIR/myreports` | 直接指定归档目录 |
| `VR_DATA_DIR` | `~/.vibe-research` | 数据根目录，与自选股 / 持仓共用 |
| （最终默认） | **`~/.vibe-research/myreports/`** | 本机实测即此路径 |

- 原文件按 `<uuid4-hex><原扩展名>` 存盘；`index.json` 存元数据（原文件名、行业、大小、扩展名、上传时间戳）。实测示例：

```json
[
  {
    "id": "69e123708f7b4c5b96b98de5a06069f7",
    "name": "H3_AP202608281828646620_1.pdf",
    "industry": "未分类",
    "size": 821550,
    "ext": ".pdf",
    "ts": 1789688135433
  }
]
```

- 落盘护栏：索引写临时文件后 `os.replace` 原子替换（`:91-95`）；上传 / 删除的「读-改-写」用 `threading.Lock` 串行化，防并发互相覆盖（`:49`、`:152-155`、`:170-180`）。**无数据库，`index.json` 是唯一真相源。**

### 5.2 历史位置与迁移（`myreports.py:25-48`）

- ≤v0.1.1 存在仓库内 `backend/.cache/myreports/`，重下载 / 覆盖项目会丢（issue #12）。
- 启动时 `_migrate_legacy()`：**仅当**未显式设置 `VR_REPORTS_DIR`、新目录不存在、旧目录存在时，复制到 `~/.vibe-research/myreports/`（先复制到 `.migrate.tmp` 再同盘原子改名；旧目录保留作备份）。
- 迁移失败不阻塞启动，但向 stderr 出声，旧数据原样留在 `backend/.cache/myreports/`。

### 5.3 隐私与合规

- 文件只写本机用户目录（仓库外），**不上传任何远端、不进开源仓库**；`backend/.gitignore` 也已忽略旧的 `.cache/`，避免误提交。
- 目录在项目之外，重装 / 覆盖项目代码不会丢数据。

---

## 六、校验与安全

后端 `save_report()`（`myreports.py:118-156`）逐项校验：

| 校验 | 行为 |
|------|------|
| 扩展名白名单 | 仅 `ALLOWED_EXT`（pdf/doc/docx/txt/md/markdown/csv/xls/xlsx/ppt/pptx/png/jpg/jpeg/webp）；**不存可执行文件 / 网页**，避免下载回放风险。不支持时报「不支持的文件类型 X；支持：…」 |
| 文件名净化 | `_sanitize_name()` 用 `os.path.basename` 去掉路径分隔符（`\` 统一成 `/`），防目录穿越；空名兜底「未命名」 |
| base64 校验 | 有 `data:` 前缀则剥到逗号后；`base64.b64decode(validate=True)` 严格解码，非法报「文件内容解码失败」 |
| 非空 | 空文件报「文件为空」 |
| 大小 | `MAX_BYTES = 25MB`，超限报「文件过大（XMB），上限 25MB」 |
| 磁盘命名 | 用随机 `uuid4` 而非原文件名落盘，原文件名只存索引，避免重名覆盖与非法字符 |

---

## 七、自动行业分类（`myreports.py:59-104`）

- 纯**文件名关键词**匹配（转小写包含判断），零依赖、离线可用；按 `_INDUSTRY_KEYWORDS` 列表**顺序即优先级**，先命中先用，全不中记「未分类」。
- 当前 9 类关键词表：

| 行业 | 关键词（部分） |
|------|----------------|
| 人形机器人 | 人形、机器人、humanoid、谐波、丝杠、滚柱、灵巧手、减速器、optimus、宇树、特斯拉 |
| 光互联 | 光互联、硅光、cpo、光模块、磷化铟、inp、光芯片、源杰、中际旭创、天孚 |
| HBM存储 | hbm、存储、内存、dram、长鑫、美光、海力士、颗粒、闪存、nand |
| AI算力 | 算力、gpu、英伟达、nvidia、服务器、液冷、pcb、交换机、cowos、沪电、工业富联 |
| 半导体 | 半导体、芯片、晶圆、光刻、封测、台积电、刻蚀、存储芯片 |
| 新能源 | 锂电、电池、光伏、储能、固态、钠电、宁德、比亚迪 |
| 创新药 | 创新药、医药、生物、cxo、临床、adc、glp、药明 |
| 商业航天 | 航天、卫星、火箭、星链、starlink、spacex、蓝箭 |
| 电力电网 | 电力、电网、特高压、变压器、输配电、燃气轮机 |

- 分类发生在**上传时**并写入索引：之后改文件名不会重分类，也不支持手工改标签（要改需删除重传）。

---

## 八、如何查看与管理

| 方式 | 操作 |
|------|------|
| 页面 | 左侧导航「我的研报」→ `/my-reports`；按行业分组浏览，点「⬇」下载，点「🗑」删除 |
| 磁盘 | `ls ~/.vibe-research/myreports/`（原文件 + `index.json`）；自定义 `VR_REPORTS_DIR` 时看对应目录 |
| 元数据 | `cat ~/.vibe-research/myreports/index.json`（UTF-8，缩进 2 空格，按 `ts` 排序由接口负责） |
| 换存储位置 | 启动后端前设 `VR_REPORTS_DIR=/path/to/dir`（或 `VR_DATA_DIR` 换根） |

---

## 九、已知边界与限制

1. **无去重**：同一文件重复上传会各存一份、各占一条记录（`id` 是 uuid，文件名不参与去重）。
2. **分类只看文件名**：文件名不含关键词就进「未分类」；误分类需删除重传（可先改名再传）。
3. **上传串行且失败即止**：一次多选时若第 N 个失败，后面的不再上传，已成功的保留；错误条提示失败原因。
4. **无并发保护（前端）**：`busy` 期间上传区仍可点击 / 拖拽，可能叠加多轮上传（后端有 `_LOCK` 保证索引不损坏）。
5. **无分页 / 搜索 / 排序切换 / 重命名 / 批量操作**：全部平铺，按行业分组 + 组内时间倒序。
6. **25MB / 白名单硬约束**：前端 `accept` 与后端校验双份，后端为准；不支持的类型、超限、空文件都会被 400 拒绝。
7. **base64 上传的代价**：文件在内存里会膨胀约 1/3（base64 编码），大文件上传体验偏重；这是为了不引入 `python-multipart` 的有意取舍。
8. **单用户单机**：数据存本机用户目录，不做多用户隔离、不跨设备同步。

---

## 十、相关文件索引

| 文件 | 作用 |
|------|------|
| `frontend/src/pages/MyReports.tsx` | 页面主体（上传区、分组列表、下载 / 删除） |
| `frontend/src/lib/api.ts` | `MyReport` 类型、`api.myReports/uploadReport/deleteReport`、`downloadReport()`（鉴权 blob 下载） |
| `frontend/src/router.tsx` | `/my-reports` 路由 |
| `frontend/src/components/layout/Layout.tsx` | 侧边栏「我的研报」入口 |
| `frontend/src/components/ui/PageHeader.tsx` / `GlassCard.tsx` / `Disclaimer.tsx` | 页头 / 玻璃卡 / 合规声明 |
| `backend/app.py:330-363` | 4 个 `/api/myreports*` 端点与 `ReportIn` 模型 |
| `backend/myreports.py` | 归档实现：存储目录解析、历史迁移、扩展名白名单、base64 解码、大小限制、文件名净化、关键词分类、索引原子读写 |
| `backend/.gitignore` | 忽略旧目录 `.cache/`（旧版研报位置） |

> 与 `docs/daily-review-page-layout.md`、`docs/watchlist-page-layout.md` 同属旧版 Web 应用的页面说明；「研究记录」(`/notes`) 的浏览器 `localStorage` 存储口径见对话记录，两处存储互不相同。
