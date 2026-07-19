# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vibe-Research — 个人 AI 投研系统（A 股/美股/港股）。FastAPI 后端 + React 19 前端，三套开源数据源打包在仓库内开箱即用。

### Architecture

```
Vibe-Research/
├── a-stock-data/       A 股全栈数据工具箱（v3.4，自带即用快照）
├── global-stock-data/  美股/港股数据工具箱（v1.0.1）
├── backend/            FastAPI :8900
│   ├── app.py          路由入口 + 中间件（CORS/鉴权/缓存）
│   ├── astock.py       A 股数据层（腾讯行情/东财研报/akshare/mootdx）
│   ├── gstock.py       美股/港股数据层（东财域内子集）
│   ├── market.py       市场情绪 + 板块资金流 + 全球指数
│   ├── newsradar.py    资讯雷达（12 赛道 108 RSS 源）
│   ├── portfolio.py    持仓 + 已清仓（本地 JSON 持久化）
│   ├── myreports.py    我的研报上传/归档（本地文件存储）
│   ├── chat.py         系统 AI 对话（function-calling 流式）
│   ├── cli_runtime.py  订阅接入（调本机已登录 CLI）
│   ├── mcp_server.py   MCP server（零第三方依赖，JSON-RPC over stdio）
│   └── tests/          pytest 测试套件
└── frontend/           Vite + React 19 + TS + Tailwind :5899
    ├── src/pages/      10 个页面（DailyReview / Intel / StockData / …）
    ├── src/components/ ui 组件 + Layout + ErrorBoundary
    ├── src/lib/        api.ts（后端 API 客户端）/ llm.ts（AI 配置）/ …
    ├── src/hooks/      useDarkMode
    └── src/data/       sectors.json（板块定义）
```

### Key Design Decisions

- **行情零依赖**：腾讯行情走标准库 `urllib`，后端未装任何三方包时行情/指数/研报仍可用
- **分级依赖**：akshare/mootdx 惰性导入，缺失时端点返回 501 + 安装提示，不拖垮服务
- **用户数据只存本地**：持仓/关注股/研报存 `~/.vibe-research/`（可 env `VR_DATA_DIR` 覆盖），不传后端、不进仓库
- **AI 无倾向**：不内置模型偏好，支持订阅接入（CLI）/ API 接入（OpenAI 兼容）/ MCP 三种方式
- **A 股红涨绿跌**：全站配色遵循 A 股惯例（暖橙主色，涨=红/跌=绿），包含全球市场模块

### Data Sources

| 数据源 | 位置 | 覆盖 |
|---|---|---|
| a-stock-data（v3.4） | `a-stock-data/` | A 股行情/K线/研报/估值/财务/公告/龙虎榜/资金面/打板情绪/ETF 期权等 40+ 端点 |
| global-stock-data（v1.0.1） | `global-stock-data/` | 美股/港股/韩股行情+财务，全球指数 |
| investment-news | `backend/news_sources.json` | 12 赛道 108 RSS 源 |

后端的 `astock.py`/`gstock.py`/`newsradar.py` 分别从上述三套数据源移植。AI agent 要调更全的 A 股数据端点，直接看 `a-stock-data/SKILL.md` 里的 copy-paste 代码。

### API Routes (Backend)

全部在 `/api` 下，前端 Vite 代理到 `127.0.0.1:8900`：

- `GET /api/health` — 健康检查
- `GET /api/indices` — A 股大盘指数
- `GET /api/quote?codes=600519,000858` — 实时行情（PE/PB/市值/涨跌停等）
- `GET /api/valuation?code=600519` — 完整估值（前向 PE/PEG/消化年数）
- `GET /api/valuation/percentile?code=600519` — 估值历史分位
- `GET /api/financials?code=600519` — 财务关键指标
- `GET /api/reports?code=600519` — 个股研报列表
- `GET /api/...` — announcements, news, kline, finance, margin, block-trade, holders, dividend, fund-flow, dragon-tiger, lockup, blocks, hot-concepts, investor-qa, industry
- `GET /api/market/overview` — 市场情绪 + 板块资金
- `GET /api/market/emotion` — 短线情绪（连板梯队等）
- `GET /api/market/turnover-top` — 成交额 TOP20
- `GET /api/global/indices` — 全球指数
- `GET /api/global/stock?symbol=AAPL` — 美股/港股个股
- `POST /api/chat` — AI 对话（流式 NDJSON）
- `GET/POST /api/radar` — 资讯雷达
- `GET/POST/DELETE /api/portfolio` — 持仓 CRUD
- `GET/POST/DELETE /api/myreports` — 研报 CRUD

### Frontend Pages

| 路由 | 页面 | 核心模块 |
|---|---|---|
| `/daily-review` | 每日复盘 | 大盘指数、全球市场、关注股票、连板情绪、成交额 TOP20、板块资金、AI 复盘 |
| `/intel` | 资讯雷达 | 12 赛道 RSS、AI 今日要点 |
| `/stock-data` | 个股数据 | 行情/估值/财务/研报/公告/资金面/龙虎榜/解禁/互动易 |
| `/watchlist` | 自选股 | 批量添加、一屏表格、AI 分析 |
| `/sectors` / `/sectors/:key` | 板块中心 | 板块+产业链 |
| `/portfolio` | 我的持仓 | 实时盈亏、已清仓 |
| `/my-reports` | 我的研报 | 上传/归档/下载/删除 |
| `/notes` | 研究记录 | 复盘/问答记录本地沉淀 |
| `/settings` | 接入 AI | 订阅/API/MCP 配置 |

Frontend uses glass (frosted glass) warm-orange dark theme by default, with `useDarkMode` hook for light mode toggle. ECharts for charts, Zustand for state, `lucide-react` for icons, `sonner` for toasts, `react-markdown` + `remark-gfm` for markdown rendering.

## Commands

### Backend

```bash
# 安装依赖
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt

# 安装开发/测试依赖
.venv/bin/pip install -r requirements-dev.txt

# 启动后端
.venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8900 --reload

# 运行测试（离线单测 + API 契约测，不联网）
.venv/bin/pytest -m "not live" -v

# 运行全部测试（含联网数据源冒烟）
.venv/bin/pytest -v

# 运行单个测试文件
.venv/bin/pytest tests/test_fixes.py -v

# 运行单个测试
.venv/bin/pytest tests/test_fixes.py::test_portfolio_crud_roundtrip -v

# 带覆盖率
.venv/bin/pytest -m "not live" --cov=. --cov-report=term
```

### Frontend

```bash
cd frontend
npm install
npm run dev        # 开发服务器 :5899
npm run build      # 构建生产版本
npm run preview    # 预览构建产物
```

### MCP Server

```bash
claude mcp add vibe-research -- "$(pwd)/.venv/bin/python" "$(pwd)/backend/mcp_server.py"
```

## Testing

- `-m "not live"` — 离线单测 + API 契约/回归测（快、不联网），开发时主要跑这个
- `-m live` — 联网数据源 shape 冒烟测，升级/发布前跑一遍
- 测试用 `fastapi.testclient.TestClient`，无需单独启动服务器
- `conftest.py` 自动用临时目录隔离用户数据（不污染 `~/.vibe-research/`）
- 数据源故障（akshare 缺失等）测试覆盖 501 降级与空结果不缓存行为

## Important Gotchas

- **加仓成本精度**：持仓合并成本保留 4 位小数（ETF/基金成本常见 3-4 位，不得截断）
- **空结果不缓存**：数据源返回空时跳过缓存，下次请求重试（避免上游瞬时故障导致 5 分钟数据空白）
- **脏数据处理**：东财接口可能返回 `'-'` 占位或字符串数字，数值处理前必须归一化（见 `test_fixes.py`）
- **CLI 超时**：订阅接入走子进程 `spawn`，默认 180s 超时防挂起
- **股票代码验证**：A 股固定 6 位数字；韩股加 `.KS` 后缀（如 `005930.KS`）；美股走字母代码
- **迁移兼容**：旧版数据在 `backend/.cache/`，新版自动迁移到 `~/.vibe-research/`（复制不覆盖，不丢数据）
- **多市场行情**：全球市场（美股/港股）沿用 A 股红涨绿跌配色，非设计 bug
