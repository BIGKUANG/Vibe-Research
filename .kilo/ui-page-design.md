# UI 页面设计文档（强制约束）

每个 UI 页面必须在 `docs/ui-design/` 下有一份对应的设计文档；**页面代码与设计文档必须同步更新，不允许只改页面不改文档**。

## 规则

1. **新建 UI 页面**时，同一步骤创建其设计文档；缺少文档的页面不得宣称完成。
2. **修改现有 UI 页面**（布局 / 区块 / 交互 / 数据来源 / 加载与失败态 / 降级行为）时，必须在同一次改动内更新对应设计文档。
3. 文档命名统一：`docs/ui-design/<page>-page-ui-design.md`（例：`docs/ui-design/stock-data-page-ui-design.md`）。
   历史命名（`*-page-layout.md`、`*-page-design.md`）视为等价文档，先保留，后续可迁移。
4. 文档最小结构（以 `docs/ui-design/stock-data-page-ui-design.md` 为模板）：
   ① 页面定位 ② UI 布局（ASCII 布局图，含区块顺序与栅格）③ 各子功能说明（组件 / 展示字段 / 交互 / 显示条件）④ 数据来源与降级（含失败 / 空数据在 UI 的提示）⑤ 相关文件索引。
5. **交付前自检**：本次是否改了 UI？若改了，对应设计文档是否已同步？

## 旧版 Web 应用页面 ↔ 设计文档映射（缺失标「待补」，遇到相关改动时补齐）

| 路由 | 页面 | 设计文档 |
|------|------|----------|
| `/daily-review` | 每日复盘 | `docs/ui-design/daily-review-page-ui-design.md` |
| `/stock-data` | 个股数据 | `docs/ui-design/stock-data-page-ui-design.md`（模板） |
| `/etf-data` | ETF 数据 | `docs/ui-design/etf-data-page-ui-design.md` |
| `/intel` | 情报 | `docs/ui-design/intel-page-layout.md` |
| `/watchlist` | 自选股 | `docs/ui-design/watchlist-page-layout.md` |
| `/screener` | 股票筛选 | `docs/ui-design/stock-screener-page-design.md` |
| `/etf-screener` | ETF 筛选 | `docs/ui-design/etf-screener-page-ui-design.md` |
| `/index-screener` | 指数筛选 | `docs/ui-design/index-screener-page-ui-design.md` |
| `/my-reports` | 我的报告 | `docs/ui-design/my-reports-page.md` |
| `/debate` | 多空辩论 | `docs/ui-design/debate-page-ui-design.md` |
| `/portfolio` | 持仓 | `docs/ui-design/portfolio-page-ui-design.md` |
| `/sectors` | 板块中心 | `docs/ui-design/sectors-page-ui-design.md` |
| `/sectors/:key` | 板块详情 | `docs/ui-design/sector-detail-page-ui-design.md` |
| `/notes` | 研究记录 | `docs/ui-design/notes-page-ui-design.md` |
| `/settings` | 接入 AI | `docs/ui-design/settings-page-ui-design.md` |
| `/login` | 登录 | `docs/ui-design/login-page-ui-design.md` |