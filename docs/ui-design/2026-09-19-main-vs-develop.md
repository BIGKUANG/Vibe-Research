# main 分支相对 develop 分支的新增功能分析（2026-09-19）

> 分析对象：本地 `main`（上游主线）相对本地 `develop`（fork 开发线）新增的功能。
> 分析时点：2026-09-19；`main` HEAD = `0827ed8`（2026-09-17），`develop` HEAD = `1f62e07`（2026-09-19）。
> 共同祖先（merge-base）= `09e8404`（2026-09-05，上游 README/CHANGELOG 更新）。
> 差异规模：`main` 领先 **21 个提交**、`develop` 领先 **14 个提交**；自 merge-base 到 `main` 共 **310 个文件、+21,669 / −2,607 行**。
> 用途：把上游主线新增的能力摸清，作为 fork 后续同步 / 移植的对照清单。本文只做代码与文档层面的功能盘点，不评价优劣、不构成产品承诺。

---

## 一、先看分支关系（避免把"落后"和"另一条线"搞混）

两个分支**不是简单的快进关系**，各自都有对方没有的提交：

| | main（上游主线） | develop（fork 开发线） |
|---|---|---|
| 定位 | 重构后的新版架构（`desktop/` 多垂类 + `orchestrator/` + `calc/` + `backtest/` …） | 保留旧版 Web 应用（`backend/` + `frontend/`）并叠加 fork 特性 |
| 独有顶层目录 | 无（是 merge-base 的超集再重构） | `backend/`、`frontend/`、`a-stock-data/`、`.kilo/` |
| 独有提交数 | 21 | 14 |
| 代表提交 | 双引擎、任务路由、多来源订阅、v1.1.0 / v1.2.0 | 股票筛选页、个股页增强、K 线、复盘页、鉴权、自选持久化 |

- **`main` 的 21 个提交时间线**（`git log develop..main`）：

```
0827ed8 2026-09-17 docs: remove hiring and donation sections
34ed581 2026-09-12 fix(data-access): harden stock news fallback and provenance (#43)
cef2890 2026-09-10 docs: reorganize README around investor workflows
b7e0c31 2026-09-09 Release v1.2.0 source workbench and address reviewed issues
f15ab89 2026-09-07 merge: retain upstream ancestry for previously adapted v1.0.4 and LAN fixes
5e87058 2026-09-07 feat: release v1.1.0 multi-provider workbench and signed Mac client
2ed80ac 2026-09-05 fix: validate M8 subscription research and close priority audit findings
b18799b 2026-09-04 feat: run subscription agents through six-stage research
49ece5e 2026-09-04 feat: add WorkBuddy subscription runtime
378123b 2026-09-04 feat: add one-command POSIX setup and startup
cb08363 2026-09-04 feat: make AI access and Agent mode global
2c45ba5 2026-09-04 feat: finalize dual-engine boundaries
4a9fbb1 2026-09-04 feat: connect routed deep research workflow
1575cfe 2026-09-04 feat: add routed quick task workflow
dfbe75a 2026-09-04 fix(validator,tools): 畸形 calc 记录不再让整次运行崩掉
ad5bcda 2026-09-04 feat(direct): 接线 --engine，并修掉真跑才暴露的两个 bug（双引擎第 6 步）
e6ed31e 2026-09-04 feat(direct): 阶段执行器 —— function calling 循环（双引擎第 5 步）
6dc4818 2026-09-04 test(schema): TS 接口与 JSON Schema 键集一致性棘轮
ef7726a 2026-09-04 feat(direct): Chat Completions 传输层 + provider 直连能力声明（双引擎第 4 步）
254cfbd 2026-09-04 refactor(tools): 受控工具收成共享 registry（双引擎第 3 步）
d6bde47 2026-09-04 refactor(engine): 引擎契约与 Codex 生命周期抽离（双引擎第 1-2 步）
```

- **改动量按区域分布**（自 merge-base 到 main）：

| 区域 | 文件数 | 增删行 | 性质 |
|------|-------:|-------:|------|
| `orchestrator/` | 122 | 13,318 | 双引擎、任务路由、订阅运行、校验、报告库、启动器 |
| `desktop/` | 79 | 4,510 | 工作台 UI：首页/设置/我的研报/持仓导入/错误页/AI Dock |
| `docs/` | 29 | 2,552 | 各里程碑验收记录、源码交付、模型接入、发布清单 |
| `backtest/` | 19 | 903 | 引擎重构、指标、约束、校验、测试 |
| `.agents/` | 21 | 843 | data-access 取数脚本与回归测试 |
| `README.md` / `README_en.md` | 2 | 918 | 围绕投资人工作流重组 |
| `calc/` | 7 | 260 | 入参形状契约、工具层、CLI |
| `scripts/` | 5 | 100 | 一键 setup / start（POSIX 新增） |
| `datasources/` | 4 | 74 | 健康巡检、上游对照 |
| `providers/` | 3 | 31 | 直连能力声明（mimo）、自托管模板重写 |
| `CHANGELOG.md` | 1 | 254 | 1.1.0 / 1.2.0 版本记录 |
| 其它 | 9 | ~80 | AGENTS.md、官网、CI workflow、codex-version、配置 |

> 说明：`main` 与 merge-base 之间**没有任何文件删除**（`git diff --name-status` 无 `D`）。v1.1.0 曾加入的 Mac 客户端在 v1.2.0 与 merge-base 之间被加回又移除，净效果为零。

---

## 二、新增功能总览

### 2.1 一句话版本

> `main` 相对 `develop` 新增的是一条**完整的新版产品线**：把"单引擎 Codex 深研"扩成**双引擎（Codex 深研 + Provider 直连）**，在两者之上加**统一任务路由/服务层**（确定性 / 轻量 / 深度三类执行器），打通 **Codex / Claude Code / WorkBuddy 三种订阅 + 模型 API** 的全局接入与 Agent 开关，补齐**取消/失败终态、数字忠实度、报告资料库与引用**等可靠性能力，配套**新桌面工作台 UI、一键 setup/start 源码交付**，并把数据、计算、回测底座整体加固。

### 2.2 主题清单

| # | 功能主题 | 代表提交 | 关键文件 | 对用户可见的变化 |
|---|----------|----------|----------|------------------|
| 1 | **双引擎架构**（引擎契约 + 能力声明） | `d6bde47` `254cfbd` `ef7726a` `e6ed31e` `ad5bcda` `2c45ba5` | `orchestrator/src/engine.ts`、`agent_runner.ts`、`engines/*` | 除 Codex 外，用户自己的模型 API 也能跑研究；manifest 记录"执行保障等级" |
| 2 | **统一任务路由与三类执行器** | `1575cfe` `4a9fbb1` `cb08363` | `task_router.ts`、`task_service.ts`、`task_adapters.ts`、`engines/{deterministic,quick,codex_deep}_engine.ts` | 一件事先判定"确定性处理 / 轻量材料处理 / 完整 Agent 研究"，再决定用不用模型 |
| 3 | **多来源订阅接入 + 全局 AI 接入** | `49ece5e` `5e87058` `cb08363` `b18799b` | `local_agent_runtime.ts`、`assistant_bridge.ts`、`providers.ts`、`runtime_provider.ts`、`light_chat.ts` | Codex / Claude Code / WorkBuddy 订阅或 API 一次接入全站可用，默认关 Agent |
| 4 | **六阶段研究跑在订阅引擎上** | `b18799b` `2ed80ac` | `engines/local_agent_stage_agent.ts`、`finance/stages.ts`、`stage_validators.ts` | Claude Code / WorkBuddy 也能做完整 A 股六阶段研究，每阶段独立会话、只开受控 MCP |
| 5 | **取消 / 失败终态 / 运行隔离** | `2ed80ac` `dfbe75a` | `research_control.ts`、`research_process.ts`、`research_failure.ts`、`service.ts`、`fsutil.ts` | 可请求中止并区分"请求 / 已确认"；失败也留完整 manifest；畸形 calc 记录不再崩整次运行 |
| 6 | **数字忠实度与来源披露** | `2ed80ac` `cef2890` | `number_fidelity.ts`、`finance/pe_disclosure.ts`、`finance/quote_freshness.ts`、`validator.ts` | 报告数字必须等于所引证据/计算值；PE 分位、报价新鲜度显式披露 |
| 7 | **报告资料库与引用回查** | `5e87058` `b7e0c31` | `report_library.ts`、`desktop/.../reportCitations.ts`、`libraryCitations.ts`、`ReportAnswer.tsx`、`ResearchReport.tsx` | 资料可检索、回答带可点引用回原文 |
| 8 | **桌面工作台 UI 重构** | `5e87058` `b7e0c31` | `desktop/src/verticals/finance/**`、`desktop/src/core/**` | 首页对话优先 + 五类功能入口、快捷接入弹窗、Agent 开关、设置页改造、路由错误页 |
| 9 | **源码交付形态（关键转向）** | `378123b` `b7e0c31` | `scripts/setup`、`scripts/start`、`orchestrator/src/startup.ts`、`startup_health.ts`、`docs/source-delivery.md` | 一键安装/启动；v1.2.0 起**暂撤 Mac 客户端**，改为源码 + 本地浏览器工作台 |
| 10 | **数据 / 计算 / 回测底座加固** | `34ed581` `2ed80ac` | `calc/contracts.py`、`backtest/**`、`datasources/health.py`、`.agents/skills/data-access/scripts/**` | 计算入参形状有契约；回测引擎重构与指标补齐；新闻备用源与溯源披露 |
| 11 | **文档、官网、CI 加固** | `cef2890` `0827ed8` `5e87058` | `README.md`/`README_en.md`、`website/index.html`、`.github/workflows/cross-platform.yml` | README 按投资人工作流重组；官网口径改为"普通对话起步、按需 Agent"；CI 强制 bash / Windows 专项测试扩容 |

---

## 三、重点功能详解

### 3.1 双引擎架构：Codex 深研 + Provider 直连

- **引擎契约**：`orchestrator/src/engine.ts` 把"一次运行"拆成**六阶段状态机 + 一个引擎**。状态机、取数、校验、gate、归档只有一份；引擎只负责两件事：`EngineLifecycle`（准备/拆除自己的环境）与 `runTurn`（`AgentRunner`，见 `agent_runner.ts`）。
- **能力声明（capabilities）**：两个引擎产出**相同的产物**，但**执行保障等级不同** —— Codex 有引擎级线程、沙箱、lifecycle hooks；直连只能保证"模型只够得着那几个受控工具"。差异必须显式写进 manifest，界面要把"产物通过校验"与"执行保障等级"分开讲，不允许混成一个 ✅（源码注释明确称之为最危险的失败模式）。
- **直连传输层**：`engines/direct_transport.ts` 用 OpenAI 兼容的 **Chat Completions**（非流式）—— 因为 Codex 引擎已移除 chat 协议，而绝大多数第三方网关、本地模型（Ollama / vLLM / LM Studio）只提供这一条线；两条路互补。
- **直连阶段执行器**：`engines/direct_stage_agent.ts` 实现 function calling 循环（发提示词 → 模型要工具 → 执行 → 回喂 → 最终回复），实现与 CodexRunner 同一个 `AgentRunner` 契约。三处刻意不照抄旧实现：工具参数解析失败**不静默置空**、工具结果**不按字符硬截**、轮数上限按阶段重新标定。
- **切换入口**：`--engine` 接线（`ad5bcda`），`2c45ba5` 收口双引擎边界。
- **直连能力声明落在 provider 模板**：`providers/mimo.json` 新增 `direct` 段（`supported / default_model / structured_output / verified_at / notes`，含 2026-09-04 实测记录）；`providers/selfhosted.json` 重写为"需验证 Responses 兼容性"的占位模板，并明确地址边界（远程必须 HTTPS，明文 HTTP 仅回环）。

### 3.2 统一任务路由与三类执行器（用户可感知的"先分流再执行"）

- `task_router.ts` 定义高层任务协议：回答"这件事该用哪类执行方式"，而不是"用哪家模型"。任务种类包含 `browse_data`、`refresh_registered_data`、`calculate`、`summarize_materials`、`compare_entities`、`explain_metric`、`extract_fields`、`answer_from_materials`、`translate_material`、`locate_passages`、`deep_research` 等。
- `task_service.ts` 是统一任务 API 的 composition：真实路由适配器 + 三类执行器 —— `DeterministicEngine`（无模型：页面查询、登记源刷新、确定性计算）、`QuickEngine`（在服务端绑定版本的材料里定位段落，一次模型请求完成，无 Shell/工具循环/联网/写盘）、`CodexDeepEngine`（把六阶段运行状态投影为统一 `TaskEvent`）。
- `task_adapters.ts` 提供真实服务端适配器（本地文档正文、页面/端点/计算注册表）。
- 前端可见映射（`desktop/.../MyReports.tsx`）：`deterministic → 确定性处理`、`quick → 轻量材料处理`、`deep → 完整 Agent 研究`。

### 3.3 多来源订阅接入与"全局 AI + Agent 开关"

- `local_agent_runtime.ts` 大幅扩展（+690 行区间）：Codex 之外接入 **Claude Code** 与 **WorkBuddy / CodeBuddy** 订阅 CLI；`assistant_bridge.ts` 做**每轮的能力桥接**，凭据与服务上下文留在 API 进程；`light_chat.ts` 承载普通对话。
- `cb08363` 把"AI 接入与 Agent 模式"做成**全局**：默认普通对话、Agent 默认关闭，明确选择跨刷新保留，同来源重测不重置；切换会中止在途聊天但不影响已启动的独立研究任务（`M24` 验收文档）。
- `runtime_provider.ts`：用户在界面选的模型配置按请求带入，**key 一个字节都不落盘**，只拼进临时 env 交给引擎。
- 普通对话与 Agent 的边界：普通对话关闭全部工具与 MCP；六阶段研究关闭内建工具、只开放产品受控 MCP；模型直连不跑 Agent、不调工具（要跑会明确提示开启 Agent，不静默降级）。

### 3.4 可靠性：取消、失败终态、数字忠实度

- **取消**：`research_control.ts` 用持久化的 request / ack 决策，**永不信任存下来的 PID**；控制文件放在 agent 运行工作区之外；run id 一次性保留，重试换新 id，迟到的取消不会打到替换 worker。`service.ts`（+599 行）与 `research_process.ts` 负责进程树退出与最终归档的原子互斥。
- **失败终态**：`research_failure.ts` + `startup.ts` 保证"确定性前置错误（未安装/未登录/版本过旧/配额不足）立即终止当前阶段"，不再重试 18 次；运行入口即使探针失败也先建 manifest，写出可恢复的失败终态。
- **数字忠实度**：`number_fidelity.ts` 从"只活在硬测试里"改成**生产 validator 与硬测试共用同一实现** —— 报告里每个数字必须等于同一行所引 evidence / calc 的值（此前"引用真实 calc-id 却写另一个数字"仍能判 complete）。豁免规则每条都对应一次真实误伤，改前必读注释。
- **来源披露**：`finance/pe_disclosure.ts` 输出 PE 分位的来源披露行；`finance/quote_freshness.ts` 用交易日历 / 参考交易日 / 盘前时段 / 停牌特征判定报价是否陈旧，不信任 agent 自填（`validator.ts` 同步调整）。
- **工具注册表收口**：`run_tools.ts` 把"一次运行里模型能做的全部动作"收成五件事（列产物 / 读产物 / 调确定性计算器 / 写当前阶段 / 写报告），并强调**入参 schema 只有一份**、Codex 走 MCP 与直连走 function calling 必须经同一个 `callRunTool()` 入口，靠共同生成而非测试断言来保证不漂移。

### 3.5 报告资料库与引用回查

- `report_library.ts`：原文件、本地正文索引、确定性检索。原文件与提取文本只写 `<dataRoot>/knowledge/reports/`；manifest 只放元数据与相对路径；PDF 走 Mozilla PDF.js、DOCX 走 Mammoth、纯文本按 UTF-8 直接读；检索结果带**报告 id / 文件名 / 页码**供 Agent 明确引用。
- 前端 `reportCitations.ts` / `libraryCitations.ts`：只把后端生成附录行的**第一列**当身份（正文提及、输入引用、代码块不算目标），回答中的引用可点回原文；`ReportAnswer.tsx`、`ResearchReport.tsx` 负责渲染。
- 配套新增测试：`pe_disclosure`、`report_library`、`research_cancel`、`number_fidelity`、`research_failure` 等。

### 3.6 桌面工作台 UI 变化

> 本节只列要点；UI 层面的全量清单（外壳 / 首页 / AI 接入 / 资料库 / 引用 / 持仓 / 路由 / 视觉 token）见 [§六](#六ui-层面新增功能专项总结)。

- **首页**：`Home.tsx` 精简（−140），`HomeOverview.tsx` 承接概览（展示证据 id / 来源 / 资料期 / 取数时间）；`homeFeatures.ts`、`homeTasks.ts` 定义五类功能入口。
- **首次接入**：新增 `QuickAiConnect.tsx`（Codex 订阅 / Claude 订阅 / WorkBuddy CLI 三个入口）、`AgentToggle.tsx`、`aiConnection.ts`、`ai-runtime` 钩子。
- **我的研报**：`MyReports.tsx` +305 行，从"上传归档"升级为**资料库 + 围绕资料提问**（含任务目标标签 `确定性处理 / 轻量材料处理 / 完整 Agent 研究`、`analysisSession`、`Route` 图标语义）。
- **持仓**：新增 `PositionImport.tsx` + `importPositions.ts`（截图/表格整理草稿，**人工核对后**才写入，不自动改台账）。
- **错误恢复**：`RouteErrorPage.tsx`（`desktop/src/core/components/`）区分 404 与运行异常，提供重新加载与返回首页，不展示原始错误正文、不清空本机配置；`lazy_routes` 支持按路由懒加载。
- **AI 面板**：`AiMessages.tsx` / `AiDock.tsx` / `useAiChat.ts` 调整，`cleanAutoLinks.ts` 新增；`FinanceAiDock.tsx` 重构。
- **设置页**：`Settings.tsx` ±211 行，配合多 provider 与预设恢复修复（`issue-pr-triage-v1.2.0.md`：按来源 + 模型共同恢复，不把用户编辑的模型名当下拉选项）。
- **局域网（可选）**：`desktop/vite.config.ts` 给 LAN 模式加 `vra-lan-origin-guard` 同源中间件（先校验 Origin / `Sec-Fetch-Site`，再走代理归一化与 token 注入），并加 `strictPort: true`（端口占用必须明确失败，不静默漂到 5931）。

### 3.7 交付形态的关键转向：v1.1.0 → v1.2.0

| 版本 | 变化 |
|------|------|
| v1.1.0（`5e87058`） | 多模型订阅接入 + Mac 独立客户端（签名、公证 DMG，构建号 40） |
| v1.2.0（`b7e0c31`） | **暂撤 Mac 客户端**：移除原生窗口、打包/签名工具、专属启动与静态网关，保留 React 浏览器 UI、源码 setup/start、Codex 引擎与全部研究 / 接入能力；改为"源码 + 本地浏览器工作台"交付 |

- 一键脚本（`378123b`）：新增 `scripts/setup`（POSIX 安装）、`scripts/start`（调用 `scripts/check-node.mjs` 后 exec `orchestrator/src/startup.ts`）；`startup.ts` 负责预检 → 同时启动 API 与浏览器界面 → 等待两端真实可用 → 打开浏览器；`startup_health.ts` 在不暴露 token 的前提下检查 UI 与带鉴权的 API 代理。
- 默认地址：浏览器 `http://127.0.0.1:5930`，后端回环 `8765`；私有数据在项目 `.local/`（旧客户端的 `~/.vibe-research-desktop` 不自动导入）。
- 依据：`docs/source-delivery.md`（含撤回范围、保留范围、验证记录：orchestrator 850 项 / 849 通过、desktop 82/82、Python 754/754；这些是当时的本地验证口径，不代表全平台发布验收）。

### 3.8 数据 / 计算 / 回测底座

- **calc**：新增 `calc/contracts.py`（"入参形状契约"，只校验调用形状不执行公式，含 `pe_deducted_annualized` / `pe_ttm_from_parts` / `forward_pe` / `forward_cagr` / `growth_rate` / `ratio` …），`tool.py`、`cli.py` 与 `SPEC.md` 同步；新增 `test_contracts.py` / `test_tool.py`。
- **backtest**：`engines/base.py` 抽出共享 bar-by-bar 执行循环（`BaseEngine` + 各市场引擎覆写规则）；`metrics.py` 从 `daily_portfolio.py` 抽为共享指标模块；`constraints.py`、`loader.py`、`validation.py`、`gate.py`、`run.py`、`engines/china_a.py` 同步调整；新增 `test_downside_metrics.py`、`test_constraints.py`、`test_datasource_health.py`、`test_cli_errors.py`、`test_engine_rules.py`、`test_loader.py`、`test_m31_audit.py` 等。
- **datasources**：`health.py` 扩展（+32 行区间），`CATALOG.md` / `UPSTREAM.md` / `README.md` 同步更新。
- **data-access（取数脚本）**：`sources/eastmoney.py` 加**一次带超时的新闻备用请求**（PR #43，不携带 Cookie、不把同源重试当独立信源）；区分"空列表"与"请求/解析失败"，备用成功时披露降级，并把每条新闻绑定到实际返回它的原始响应；新增 `sources/finra.py`、重写 `sources/probability.py`、新增 `core/retrieval_cli.py`；新增 `test_stock_news_fallback.py`、`test_official_http.py`、`test_m36_probability_budget.py`、`test_retrieval_cli.py`、`test_redaction.py`、`test_kline_freshness.py` 等。
- **providers**：`mimo.json` 增 `direct` 段与实测说明；`selfhosted.json` 模板重写；`providers/README.md` 明确"远程 HTTPS、回环允许 HTTP"的地址边界（与双引擎直连一致）。

### 3.9 文档、官网与 CI

- **README 重组**（`cef2890`）：按"投资人工作流"重排 —— 13 个一级栏目按使用场景分组呈现（直接开始 / 看市场 / 看行业 / 研究与验证 / 管理与积累 / 连接模型），并新增"界面预览""当前边界""工作方式"等章节；`README_en.md` 同步。
- **新增文档**：`docs/source-delivery.md`、`docs/development-validation.md`、`docs/issue-pr-triage-2026-09-12.md`、`docs/issue-pr-triage-v1.2.0.md`、`docs/双引擎任务架构_v3_2026-09-04.md`，以及 M12–M40 系列验收记录（跨来源业务验收、运行隔离与辩论中止、检索与计算展示、界面 V2 迁移、Mac/Windows、发布候选与隐私验收等，共 29 个 docs 变更）。
- **官网**（`website/index.html` + 更新截图）：口径从"基于 Codex Harness 的金融 Agent"改为"**接入自己的 AI，普通对话起步，按需开启 Agent**"；`operatingSystem` 改为 Windows / macOS / Linux；新增 `assets/screenshots/2026-09-07/` 界面图（空白隔离工作区拍摄，无私人数据）。
- **CI**（`.github/workflows/cross-platform.yml`）：新增 `workflow_dispatch`；测试步骤统一 `shell: bash`（避免前半失败被后半成功掩盖）；Windows 专项从 1 个测试扩到 8 个（`windows_support` / `local_agent_runtime` / `local_agent_stage_agent` / `runtime_provider` / `task_router` / `task_adapters` / `run_tools_registry` / `startup_health`）并强制检查退出码。

### 3.10 新增测试（可靠性证据）

`orchestrator/test/` 新增/扩充数十个测试文件，与上面功能一一对应，包括：`engine_boundary`、`direct_transport`、`direct_stage_agent`、`quick_engine`、`deep_engine`、`task_router`、`task_service`、`task_adapters`、`run_tools_registry`、`assistant_tools`、`guided_tool`、`startup`、`startup_health`、`research_cancel`、`research_failure`、`number_fidelity`、`pe_disclosure`、`report_library`、`runtime_provider`、`runtime_environment`、`schema_type_parity`、`repository_version`、`source_delivery`、`light_chat`、`debate`、`service_api_mcp` 等；`desktop/test/` 新增 `daily_review_context`、`research_cancel`、`research_report`、`report_citations`、`library_citations`、`import_positions`、`closed_position`、`route_error`、`task_mode`、`ai_runtime`、`ai_connection`、`ai_surface`、`lan_proxy`、`lazy_routes`、`workspace_visual` 等。

---

## 四、对 fork（develop）的实际影响与边界

1. **两条线并存**：`develop` 仍保留旧版 `backend/` + `frontend/`（`run.sh` 启动，端口 8900/8901）与 `a-stock-data/`、`.kilo/`；`main` 只有新版 `desktop/` + 底座模块。上游在 `d8c80d4..09e8404` 做过彻底重构，因此**上游更新不能直接 merge 进 develop**，需要按新架构移植（`AGENTS.md` 已有此约定）。
2. **同名目录语义不同**：两侧都有 `desktop/`，但 `develop` 侧是在 fork 语境下使用的 React 浏览器 UI（`vite.config.ts` 代理到旧后端编排器 token），`main` 侧是多垂类包结构（`@` 别名指向 `verticals/finance`）—— 直接互相覆盖会打断别名与代理约定。
3. **两边都有价值功能**：`main` 独有双引擎 / 任务路由 / 多来源订阅 / 数字忠实度 / 报告库 / 一键交付；`develop` 独有股票筛选页、个股页增强（K 线、估值分位）、复盘页重排与折叠、登录鉴权、自选后端持久化等。同步方向要按功能逐项决定"移植上游"还是"保留 fork"。
4. **文档编号≠发布状态**：`main` 的 CHANGELOG 与验收文档里大量 M12–M40 记录是**开发历史**，文档自身也声明"旧版本号、提交状态与测试数量仅代表各次记录"，不构成当前发布就绪或全平台验收结论。

---

## 五、如何自行核对（命令清单）

```bash
# 分支关系与共同祖先
git merge-base develop main
git rev-list --count develop..main     # main 独有提交数（本次 21）
git rev-list --count main..develop     # develop 独有提交数（本次 14）

# main 新增提交清单 / 单提交详情
git log --oneline --no-decorate develop..main
git show 2c45ba5 --stat

# 全量差异与按区域聚合
git diff --stat $(git merge-base develop main) main
git diff $(git merge-base develop main) main -- orchestrator/src/engine.ts

# 关键新增模块（直接读上游版本，不切分支）
git show main:orchestrator/src/task_router.ts | head -40
git show main:docs/source-delivery.md
git show main:CHANGELOG.md | head -60
```

---

## 六、UI 层面新增功能专项总结

> 范围：`main` 相对 `develop` 在**界面层**新增/改造的内容。
> **重要前提**：这些 UI 全部落在新版工作台 `desktop/`（Vite + React，默认 `http://127.0.0.1:5930`，多垂类包结构）。`develop` 的旧版 Web UI（`frontend/`，`run.sh` → 8901，含股票筛选页、个股数据页、复盘页折叠等 fork 特性）**未被本次合并改动一行**，两套 UI 当前并存、互不影响。
> 主要文件：`desktop/src/verticals/finance/**`（垂类 UI）、`desktop/src/core/**`（通用 AI 壳层）、`desktop/src/index.css`（视觉 token）。

### 6.1 界面外壳：V2「工作空间」框架（`components/layout/Layout.tsx`，364 行区间改动）

| 区域 | 新增内容 |
|------|----------|
| 侧栏 | `workspace-sidebar` 新样式；品牌区改用矢量图 `PhoenixTreeLogo` + `Vibe-Research` 字标；品牌下方新增 **AI 身份区**（`data-ai-identity`：说明文案 + `ai-runtime-badge` 链接到 `/settings` 显示已保存来源 + `AgentToggle`） |
| 导航 | 13 个一级栏目（首页 / 每日复盘 / 资讯雷达 / 产业信号 / 板块中心 / 个股研究 / 多空辩论 / 回测 / 自选股 / 我的持仓 / 我的研报 / 研究记录 / 接入 AI）；`/intel`、`/signals`、`/sectors` 支持**可折叠子栏目**（`ChevronDown` + `aria-expanded`，如 `/intel/news` 公开新闻、`/signals/gpu-rent` GPU 租金、`/sectors/humanoid` 人形机器人） |
| 侧栏底部 | 新增 Phoenix Tree 官网入口（`https://phoenixtree.ai/`，新标签页、带 `aria-label`），X / GitHub，收起-展开按钮；**默认收起**，状态存 localStorage（键带版本号，旧值不串味） |
| 移动端 | 新增抽屉式导航：遮罩按钮「关闭导航遮罩」、`Menu`/`X` 图标、Esc 关闭、打开时对下层内容加 `inert`、点击菜单后把焦点移回主区 |
| 顶栏 | `workspace-topbar`：左侧面包屑「工作空间 / 当前页名」（由路由表反查）、移动端菜单按钮；右侧「本地金融研究工作台」小字 + 暗色切换；非首页时右侧留出 `mr-24` 给悬浮 AI 按钮 |
| 内容区 | `workspace-content`：统一 `max-width: 1600px`、30/34px 内边距、玻璃卡之间 20px 间距（CSS 统一约束，页面不用各自写间距） |
| 可访问性 | 新增「跳到内容」链接（`workspace-skip`，聚焦才可见）、`aria-busy` + 「正在打开页面…」导航状态、`:focus-visible` 描边、`forced-colors` 适配、`prefers-reduced-motion` 下关闭毛玻璃 `backdrop-filter` |
| 视觉 token | `desktop/src/index.css` 增约 209 行：`--workspace-display-font` / `--workspace-mono-font`、`.workspace-title`（clamp 25–34px）、`.workspace-kicker`、`.workspace-index-value`（表格数字对齐）、`.workspace-panel-head`、`.research-*`，以及 `.ai-surface` 暖橙玻璃的**明暗两套**变量与 `.ai-chat-trigger` 悬浮按钮样式 |
| 页头组件 | `PageHeader` 改版：标题上方新增 kicker 行「Vibe Research / Workspace」，标题改用 `workspace-title`，副标题限宽 `max-w-4xl`，`actions` 支持 `flex-wrap` 换行 |

### 6.2 首页：对话优先 + 功能直达（`pages/Home.tsx`、`components/HomeOverview.tsx`、`lib/homeFeatures.ts`）

- **对话首屏**：首页顶部直接是 `FinanceHomeAgent`（AI 面板），带「新对话」按钮、输入框提示「说说要查什么、研究什么…（Shift+Enter 换行）」；建议问题**随 Agent 开关切换**（普通对话 / Agent 各一套）。
- **市场概览 + 回到最近研究**（`HomeOverview`）：数字单元格 `title` 挂**溯源信息**（证据 id · 来源 · 资料期 · 取数时间），未取到显示「未获取」，不编数。
- **「研究工具，一站直达」**：按 5 组 13 个入口平铺（编号 01–05，`grid` 2/3/5 列自适应）—— 市场与资讯 / 行业与赛道 / 公司研究与验证 / 资料与投资记录 / 工作台设置（`HOME_FEATURE_GROUPS`）。
- 首页**不再自动取数、不自动启动任务**；原 `Home.tsx` 的大块内容被拆出精简（−140 行）。
- 非首页路由右下角常驻悬浮 AI 入口（`FinanceAiDock`，`pathname !== "/"` 才渲染）。

### 6.3 AI 接入与 Agent 开关

- **快捷接入弹窗**（新增 `components/ui/QuickAiConnect.tsx`）：三个一行入口 —— Codex 订阅（标「推荐」）/ Claude 订阅 / WorkBuddy CLI，另有「其他接入方式」跳设置页；未接入时可直接关闭弹窗继续浏览栏目。
- **全局 Agent 开关**（新增 `components/ui/AgentToggle.tsx`）：`role="switch"` + `aria-checked` + `aria-description`；展开侧栏带「（更深入·较慢·费Token）」提示，收起侧栏只留开关；未接入时禁用并提示「请先接入 AI」；保存在本地并跨页面共享（侧栏与设置页同一份偏好）。
- **设置页重构**（`pages/Settings.tsx`，±211 行）：页头改为「接入 AI / 连接订阅或 API 后即可普通对话；需要联网、工具或多步研究时，开启左上角 Agent」；左右两栏「订阅接入」「API 接入」；新增运行状态徽标（本地 API 已连接 / 未连接 / 正在检测）；订阅区含 Codex 登录（授权后自动检测、无需刷新）；API 区含 Base URL / Model / API Key 与能力说明（该来源是否支持模型直连，不支持时明示「仍通过原订阅客户端或 Responses 引擎连接，不转换订阅凭据、不启动研究工具」）。

### 6.4 我的研报：从「归档」升级为「资料库 + 围绕资料提问」（`pages/MyReports.tsx`，+305 行）

- 页头下方两条状态徽标：「正文已建立本地检索索引」「Agent / 模型回答会标注研报 id 与页码」。
- 新增**材料任务区**：大输入框（上限 8000 字，示例「找出这些研报中关于收入变化、原因和风险提示的原文段落」）+ 执行按钮（`Play` / 转圈），并实时显示**系统选择**：确定性处理 / 轻量材料处理 / 完整 Agent 研究（对应统一任务路由）。
- 列表行支持**多选**（`aria-label="选择 <文件名>"`，任务执行期间禁用），行内保留原文件「预览 / 下载 / 删除」。
- **正文预览**与**删除确认**改用原生 `<dialog>`，标题带 `report-panel-title` 可访问名。
- 支持 `?report=<id>` 查询参数：从 AI 回答的引用可直接跳到对应资料（`useSearchParams`）。

### 6.5 研究报告、运行列表与引用回查

- **引用组件**（新增 `components/ReportAnswer.tsx` + `lib/reportCitations.ts` / `libraryCitations.ts`）：把回答里的资料引用渲染成**可点链接**（内部引用走 React Router 跳 `/my-reports?report=...`）；资料名读取失败时提示「原始引用编号已保留，可到『我的研报』核对」，不静默丢引用。
- **裸链接修复**（新增 `core/ai/cleanAutoLinks.ts`）：只修 Markdown 自动链接把中文标点（），。；！？、】》）吃进 URL 的情况，显式链接与带签名的地址原样保留。
- **报告与运行状态**：`components/ResearchReport.tsx`（`<article aria-label="已校验研究报告">` 的「研究论文」样式）；`components/ResearchRunItem.tsx`（运行行：名称 / 代码 / 中文状态标签「完成、失败、资料不完整、未通过校验、资料过期、进行中、已取消、正在取消、归档收尾中、待跑」/ `dateTime` 时间）；`ResearchFailureNotice`（失败说明 + 「重新发起会建立新运行，不是从断点续跑」+ 跳设置）。
- `pages/Research.tsx` 按上述组件重排（±110 行）。

### 6.6 持仓与导入

- 新增 `components/PositionImport.tsx` + `lib/importPositions.ts`：截图 / 表格 → 转写草稿 → **人工核对** → 填入表单（不自动写台账）；`pages/Portfolio.tsx` 页头明确边界「持仓台账保存在本地、不进仓库；转写时所选文件内容会发送给已连接的 AI；行情每半小时自动刷新」。
- `hooks/useLiveQuotes.ts`、`lib/quoteSnapshot.ts`：行情展示口径调整（快照时间）。

### 6.7 路由、错误恢复与其它页面

- **路由懒加载**：`router.tsx` 全部改为 `lazy: async () => import(...)`；根路由新增 `errorElement: <RouteErrorPage />`（新增 `core/components/RouteErrorPage.tsx`）—— 中文恢复页区分 404 与运行异常，提供「重新加载 / 返回首页」，**不展示原始错误正文**、不清空本机配置。
- **访问与边界**：`desktop/vite.config.ts` 加 `strictPort: true`（端口被占必须明确失败，不静默漂移）；LAN 模式前置同源守卫中间件（跨站请求返回 `forbidden_origin` 403 JSON）。
- 既有页面按 V2 类名与统一 AI 面板对齐：`DailyReview`（+74）、`Backtest`（+15）、`Debate`（+9）、`Watchlist`（+10）、`Signals`（+2）。
- **界面预览资产**：新增 `assets/screenshots/2026-09-07/`（首页深色 / 浅色、接入 AI 弹窗，空白隔离工作区拍摄），README 增设「界面预览」章节引用。
- AI 壳层调整：`core/ai/AiMessages.tsx`（+51）、`AiDock.tsx`、`AiConsole.tsx`、`useAiChat.ts`，以及 `FinanceAiDock.tsx`（±115）——工具调用展示、消息气泡与输入区样式随 `.ai-surface` 统一。

### 6.8 UI 变更的直观对照

| 用户看到的变化 | develop 旧版 UI | main 新版 UI |
|----------------|-----------------|--------------|
| 首屏 | 无独立首页（直接进每日复盘） | 对话优先的首页 + 5 组功能卡片 |
| 全局 Agent 开关 | 无 | 侧栏 AI 身份区 + 设置页，跨页面共享 |
| 首次接入 | 需自行进设置页填 | 首页弹「快捷接入」（Codex / Claude / WorkBuddy / 其他） |
| 我的研报 | 拖拽上传 + 按行业分组的文件列表 | 资料库：检索索引 + 材料任务 + 多选 + 正文预览 + 引用回跳 |
| 研究报告 | 无（旧栈无六阶段研究 UI） | 六阶段研究页 + 运行列表 + 已校验报告样式 + 引用回查 |
| 我的持仓 | 表格录入 | 截图 / 表格转写草稿 → 人工核对后填入 |
| 侧栏 | 固定展开、无子栏目折叠 | 默认收起、子栏目可折叠、移动端抽屉 |
| 报错 | 白屏或原始错误 | 中文恢复页（重新加载 / 返回首页） |

---

## 附：main 新增文档清单（相对 merge-base）

| 文件名 | 主题 |
|--------|------|
| `docs/source-delivery.md` | v1.2.0 源码交付：暂撤 Mac 客户端的范围、保留项与验证记录 |
| `docs/development-validation.md` | 开发与验证口径 |
| `docs/issue-pr-triage-2026-09-12.md` | Issue / PR 处理记录（含 #43 新闻备用源） |
| `docs/issue-pr-triage-v1.2.0.md` | v1.2.0 增量修复记录 |
| `docs/双引擎任务架构_v3_2026-09-04.md` | 双引擎 + 统一任务层架构方案 |
| `docs/AI接入与执行模式_v1_2026-09-04.md` | AI 接入与执行模式设计 |
| `docs/上游Issue同步验收_2026-09-05.md` | 上游 Issue 同步验收 |
| `docs/运行隔离与辩论中止验收_2026-09-05.md` | 运行隔离、辩论取消 |
| `docs/检索与计算展示验收_2026-09-05.md` | 资料检索与计算展示 |
| `docs/深度研究取消验收_2026-09-05.md` | 深度研究取消闭环 |
| `docs/界面V2迁移验收_2026-09-05.md` | 界面 V2 迁移 |
| `docs/剩余审计整改_M13_2026-09-05.md` | 剩余审计问题整改 |
| `docs/跨来源业务验收_M12_2026-09-05.md` | 跨来源（Codex/Claude/WorkBuddy）业务验收 |
| `docs/完整版本机验收_M14_2026-09-05.md` | 完整版本机验收 |
| `docs/界面与Claude验收_M15_2026-09-06.md` | 界面与 Claude 验收 |
| `docs/开发快速验证_M16_2026-09-06.md` | 开发快速验证 |
| `docs/自动归档交付验收_M17_2026-09-06.md` | 自动归档交付 |
| `docs/故障收尾与完整范围验收_M18_2026-09-06.md` | 故障收尾 |
| `docs/Windows云端验收_M19_2026-09-06.md` | Windows 验收 |
| `docs/赛博风界面改造_M20_2026-09-06.md` | 界面改造 |
| `docs/公开版视觉与品牌Logo恢复_M21_2026-09-06.md` | 视觉与 Logo |
| `docs/聊天工具开放验收_M22_2026-09-06.md` | 聊天工具开放（13 个工具入口） |
| `docs/首页快捷接入与功能导航_M23_2026-09-06.md` | 首页快捷接入与导航 |
| `docs/Agent开关与普通对话_M24_2026-09-06.md` | Agent 开关与普通对话 |
| `docs/Mac安装包本地验收_M32_2026-09-06.md` | Mac 打包（已被 v1.2.0 撤回，属历史） |
| `docs/Mac独立窗口与引擎升级_M34_2026-09-06.md` | Mac 客户端（历史） |
| `docs/安装版AI接入修复_M35_2026-09-06.md` | 安装版 AI 接入（历史） |
| `docs/数据可用性与安装版验收_M36_2026-09-06.md` | 数据可用性 |
| `docs/发布候选与Mac验收_M37_2026-09-07.md` | 发布候选（历史） |
| `docs/Mac正式签名与公证_M38_2026-09-07.md` | 签名公证（历史） |
| `docs/README更新验收_M39_2026-09-07.md` | README 更新 |
| `docs/发布候选与隐私验收_M40_2026-09-07.md` | 发布候选与隐私验收 |

> 与 `docs/ui-design/stock-screener-page-design.md`、`docs/ui-design/daily-review-page-ui-design.md`、`docs/ui-design/my-reports-page.md`、`docs/ui-design/watchlist-page-layout.md` 等 fork 侧文档分属两条线：前者描述上游新版工作台，后者描述旧版 Web 应用。
