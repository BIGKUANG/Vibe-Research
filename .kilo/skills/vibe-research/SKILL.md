---
name: vibe-research
description: Vibe-Research 项目开发 SOP——本仓库双应用结构（旧版 Web 应用 backend+frontend 与新版 desktop 桌面应用）、启动/构建/测试命令、git 工作流、数据纪律边界。当任务涉及在本仓库改代码、修 bug、跑服务、写测试、核对功能实现时使用；纯金融个股研究的取数/估值任务请使用 .agents/skills 下的具体 SOP（company-research / data-access / valuation 等）。
---

# Vibe-Research 项目开发 SOP

## 仓库结构：两个应用并存（先确认改哪边）

- **旧版 Web 应用**（fork 特性主线，用 `run.sh` 启动）
  - `backend/`：Python FastAPI（uvicorn :8900），含登录鉴权（VR_AUTH_USER/PASS）、股票代码自动补全接口、价格分布 K 线等 fork 特有功能
  - `frontend/`：Vite + React（:8901），`@` 别名指向 `frontend/src`
- **新版 Desktop 应用**（上游重构主线）
  - `desktop/`：Vite + React，`@` 别名指向 `desktop/src/verticals/finance`
  - 多垂类外壳结构：`desktop/src/verticals/finance/` 是金融垂类，`desktop/src/core/` 是 AI 对话等公共层
  - 数据来自 Node 编排器底座，浏览器不持有后端 token（由 Vite 代理注入，见 `desktop/vite.config.ts`）
- 上游在 `d8c80d4..09e8404` 之间做过一次彻底重构（旧 backend/frontend 迁移为 desktop 多垂类）。**改代码前先确认目标应用**，两个应用互不构建彼此的代码。

## 常用命令

### 旧版 Web 应用
```bash
./run.sh start        # 启动后端(:8900) + 前端(:8901)，自动装依赖
./run.sh status       # 查看后端/前端/外网隧道状态
./run.sh stop         # 停止全部（含 cloudflared 隧道）
./run.sh restart      # 重启（不含隧道）
./run.sh tunnel       # 启动 cloudflared 外网隧道（需本机装有 cloudflared）
tail -f logs/backend.log   # 后端日志（启动失败先看这里）
tail -f logs/frontend.log  # 前端日志

cd frontend && npm run build      # 类型检查 tsc -b + 产物构建
cd frontend && npm test           # 测试（node --test tests/*.test.mjs）
cd backend && python3 -m pytest tests/ -q     # 后端测试
```

### 新版 Desktop 应用
```bash
cd desktop && npm install && npm run dev    # 需要底座/编排器 API 在跑
cd desktop && npm run typecheck             # tsc --noEmit
cd desktop && npm run build                 # tsc --noEmit && vite build
cd desktop && npm test                      # node --test test/*.test.ts
```

## Git 工作流

### 身份与分支约定
- **开发分支 = `develop`**：日常开发一律在 `develop` 分支上进行（不要直接在 main 上开发）。
- git 身份：`BIGKUANG <915320555@qq.com>`。

### 双远程（只读 vs 可写）
- `origin` = `https://github.com/simonlin1212/Vibe-Research`：**官方代码**，仍在持续更新，但**没有提交权限（只读）**。
- `fork` = `git@github.com:BIGKUANG/Vibe-Research.git`：官方代码的 **fork**，**有提交权限**；本项目改动推送到这个远程（如 `git push fork develop`）。
- 需要提交代码时，一律以 fork 为目标远程（常规 push 即可，无需 force；若 fork 分叉超出 fast-forward，先核对再用 `--force-with-lease`）。

### 日常开发流程
- 默认在 `develop` 分支下修改 → 本地 commit（中文，格式 `类型(范围): 描述`）→ `git push fork develop`。

### 上游同步流程（origin → main → develop，rebase 方式）
当需要把官方更新拉下来时，按固定顺序执行，**把官方更新基到 develop 之下、自己的提交保持在提交历史最后面**：
1. `git checkout main && git fetch origin && git merge --ff-only origin/main`（main 只做上游的快进同步，不在此分支提交代码）
2. 若需要，`git push fork main`
3. `git checkout develop`
4. `git rebase main`：把最新 main 合入 develop。**rebase 后自己的 commit 会自然排在历史末尾**；有冲突就逐个解决（先查看冲突文件，必要时先 stash 未提交改动并确认工作树干净），继续 `git rebase --continue` 直到完成
5. `git push --force-with-lease fork develop`（rebase 改写了历史，需 force-with-lease 推送；推送前确认此前的 develop 已推上过 fork，避免覆盖他人/丢失记录）
6. 确认最终 `git log --oneline` 顺序：上游最新提交在前，自己的提交在后

### 其他提交/推送纪律
- 提交信息用中文，格式 `类型(范围): 描述`（如 `feat(chat): 支持智谱 baseUrl`）
- **未明确要求不得 commit / push**；push 冲突时先 fetch 核对分叉，rebase 前先 stash 未提交改动并确认工作树
- 上游重构后主干在 `desktop/`；旧 `backend/`+`frontend/` 是 fork 特性，改动上游后同步需按新架构移植
- `.gitignore` 已覆盖：`.local/`、`.env*`（保留 `.env.example`）、`node_modules/`、`dist/`、`logs/`、`.vite/`、`*.tsbuildinfo`；不要提交密钥与产物

## 取数能力扩展规则（astock.py 不够用时）
- `backend/astock.py` 是旧版 Web 应用的取数层（移植自 a-stock-data 的自包含实现）。当开发需求要取的数据 **`astock.py` 不支持** 时：
  1. 先查 `a-stock-data/SKILL.md`（A股全栈数据工具包 v3.6 参考文档，十层 47 端点，含行情/K线/研报/打板/热榜/资金面/公告/ETF期权等），找到对应功能与接口签名、端点、坑点（其 SKILL.md 里自带可直接移植的样例代码）。
  2. 按其功能在 `/Users/shendakuang/Desktop/app/simon/Vibe-Research/backend/stock.py`（若无则新建）里开发取数函数——**沿用本项目惯例：自包含移植**（直接 urllib/requests 调端点，不依赖 a-stock-data pip 包），函数风格与 `astock.py` 一致（`DependencyMissing` 惰性依赖、`em_get` 限流、返回 list[dict]）。
  3. 在 `backend/app.py` 注册 `/api/*` 路由（含鉴权与错误处理），前端 `frontend/src/lib/api.ts` 加类型与方法后接入页面。
- **a-stock-data 目录约定**：仓库根目录 `a-stock-data/` 只是参考文档目录，**只提交其中的 `SKILL.md`**，其余（源码/示例/资产/`.git.bak`）一律不提交（外层 `.gitignore` 已配置 `a-stock-data/*` + `!a-stock-data/SKILL.md`）。其内嵌 `.git` 已改名 `.git.bak` 保证 SKILL.md 可入库；任何人想恢复该目录为可更新仓库需先把 `.git.bak` 改回 `.git`。

## 数据纪律边界（源自 AGENTS.md，研究类任务必须遵守）
- 禁止凭记忆生成行情 / 财务 / 估值 / 一致预期数据；事实数字必须来自取数调用并落盘证据
- 金额 / 年限 / 比率 / 倍数一律经 `calc/` 确定性函数计算，禁止心算
- 不给建仓 / 加减仓 / 目标价 / 止损位等任何投资动作建议
- 研究类任务：加载 `.agents/skills/` 下对应 SOP（company-research / data-access / valuation / earnings-analysis / industry-chain / catalyst-risk），按六阶段流程产出结构化产物

## 常见任务速查
- 想把旧版跑起来：`./run.sh start`，浏览器开 `http://localhost:8901`
- 想跑新版桌面应用：`cd desktop && npm run dev`
- 修类型/构建错误：进入对应目录跑 `npm run typecheck` / `npm run build`，按报错逐个修
- 后端启动失败：先看 `logs/backend.log`，常见原因是缺模块（见 `backend/requirements.txt`）或端口占用