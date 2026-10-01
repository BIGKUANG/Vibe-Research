# 股票筛选页 API 调用路径与 3 秒预算

> 关联设计文档：[stock-screener-page-design.md](stock-screener-page-design.md)（页面布局与排版，功能需求）。
> 数据参考：`a-stock-data/SKILL.md`（v3.6.1）+ `docs/full-market-snapshot.md`（腾讯批量全市场原型）。
> 硬约束：**从点击「开始筛选」到结果可见 ≤ 3s**；零鉴权；不触发封 IP；事实数字必须来自本次取数。
> 结论速览：**MVP 只需 3 个数据源**（腾讯批量 + mootdx 财务 + 本地静态表），全部属「不封 IP / 低风险」档；**东财系一律不接入**。

---

## 一、筛选维度 → a-stock-data API 映射

| 筛选/展示维度 | 字段 | a-stock-data 函数 | § | 端点/协议 | 源 | 风险 | 是否在 3s 关键路径 |
|---------------|------|-------------------|----|-----------|----|------|---------------------|
| 代码/名称/行业/地区/板块/上市日 | `code,name,industry,area,market,list_date` | 本地 `stock_codes.csv` | L0 | 本地文件 | 本地 | 无 | 是（0ms） |
| 现价/涨跌%/换手%/量比/振幅%/成交额 | `price,change_pct,turnover_pct,vol_ratio,amplitude_pct,amount_wan` | `tencent_quote` | §1.2 | `https://qt.gtimg.cn/q=`（GBK） | 腾讯 | 不封 IP | 是 |
| PE(TTM) / PB / 总市值 / 流通市值 | `pe_ttm,pb,mcap_yi,float_mcap_yi` | `tencent_quote` | §1.2 | 同上（字段 39/46/45/44） | 腾讯 | 不封 IP | 是 |
| 涨跌停价（判涨停/跌停） | `limit_up,limit_down` | `tencent_quote` | §1.2 | 同上（字段 47/48） | 腾讯 | 不封 IP | 是 |
| 证券类型（剔除 ETF/指数/可转债） | `security_type` | `tencent_quote` | §1.2 | 同上（**字段 61**，需补解析） | 腾讯 | 不封 IP | 是 |
| 停牌/僵尸报价 | `is_stale` | `tencent_quote` | §1.2 | 同上（字段 37/3/4 组合判断，需补） | 腾讯 | 不封 IP | 是 |
| ST / 退市排除 | `name` 含 `ST` / `退` | `tencent_quote` 名称 + 本地 `name` | §1.2 | 同上 | 腾讯/本地 | — | 是 |
| ROE | `roe` | mootdx `client.finance(symbol)` | §6.1 | TCP 7709（`Quotes.factory(market='std')`） | 通达信 | 不封 IP | **否（异步）** |
| 全市场代码表（刷新/补 orgId，可选） | `code,orgId` | 巨潮 `szse_stock.json` | §7.1 | `http://www.cninfo.com.cn/new/data/szse_stock.json` | 巨潮 | 低 | 否（启动/每日缓存） |

**结论**：关键路径上只有 **腾讯批量** 一个网络源 + 本地文件；ROE 走异步；巨潮只是后台刷新用，不进首屏。

---

## 二、调用路径

### 2.1 总览

```
浏览器 (React)                后端 (FastAPI :8900)                  数据源
   │
   │ ① GET /api/screener/snapshot
   │ ─────────────────────────▶ │
   │                            │ L0 本地表（启动时读入内存，常驻）
   │                            │ 快照缓存命中？ ── 是 ──▶ 直接返回 (<50ms)
   │                            │        │ 否（冷启动 / 过期）
   │                            │        ▼
   │                            │ 腾讯批量 qt.gtimg.cn（分块 500，Keep-Alive）──▶ 腾讯
   │                            │ 解析 88 字段 + join L0 + 单位归一
   │                            │ 写缓存(TTL 60s) + GZip
   │ ◀───────────────────────── │  紧凑列式 JSON
   │
   │ ② 点「开始筛选」→ 纯前端 useMemo 过滤/排序（<50ms，无网络）
   │
   │ ③ 结果先渲染；随后异步
   │    GET /api/screener/enrich?groups=roe&codes=…
   │ ─────────────────────────▶ │ mootdx finance 逐只取 roe（≤50 只）──▶ 通达信
   │ ◀───────────────────────── │ ROE 增量 merge（允许晚到）
```

### 2.2 冷启动（服务端无缓存）时序与耗时预算

| # | 步骤 | 源 | 预算 | 说明 |
|---|------|----|------|------|
| 1 | L0 本地表加载 | 本地 | 0ms（常驻） | 服务启动时把 `stock_codes.csv` 读入内存并建索引 |
| 2 | 腾讯批量：5562 只 / 500 = 12 块 | 腾讯 | **1.6–2.2s** | 串行；分块 500；`r.encoding="gbk"`；复用 `requests.Session` |
| 3 | 解析 88 字段 + join L0 + 归一 | 本地 | ~100ms | 5500 × 16 列 |
| 4 | 序列化紧凑数组 + GZip | 本地 | ~80ms | 见设计文档 §5.1 |
| — | **服务端合计** | | **1.9–2.4s** | < 3s ✓ |
| 5 | 前端本地过滤/排序 | 浏览器 | <50ms | 虚拟滚动只渲染可视行 |

> 实测依据：`docs/full-market-snapshot.md` §3——分块 500 全市场取回 5817 条约 **1.89s**（串行）。留 ~0.5s 余量仍 <3s。

### 2.3 热缓存（60s 内）

- 命中后端内存缓存 → **<50ms** 返回；点「开始筛选」本地过滤 → 结果即时可见。

### 2.4 缓存过期（stale-while-revalidate）

- 有过期但可用的旧快照：**先返回旧快照（响应内带 `as_of` 并标注「可能过期」）**，同时后台刷新；用户侧仍 <50ms，绝不被刷新阻塞。

### 2.5 ROE 异步增强

- 结果渲染后再请求，**不占 3s 预算**；`codes` 上限 50（前端截断），mootdx TCP 可 4–6 路小幅并发，单只 ~30–80ms → 约 0.5–1.5s；会话内 `Map` 缓存，重复结果集不再请求。
- 加载期间 ROE 列显示骨架条；失败显示「—」+ 原因，不影响筛选与其它列。

---

## 三、保证 < 3s 的工程措施

1. **L0 内存常驻**：本地代码表启动时加载，请求路径不读磁盘。
2. **用本地 CSV 作为全市场代码宇宙**：冷启动不依赖巨潮代码表（巨潮只用于每日后台刷新/补 `orgId`），少一跳网络。
3. **腾讯批量化**：分块 500（实测 ≤800 可用，2000 被拒），复用 `Session`（Keep-Alive），GBK 解码；腾讯不封 IP，保守取串行已达标，如需更快可 3–4 路并发。
4. **紧凑列式 + GZip**：响应约 1.2–1.7MB 原始 → gzip 后 300–400KB（FastAPI `GZipMiddleware`）。
5. **stale-while-revalidate**：只让「服务首次启动且完全无缓存」走冷路径，其余都秒回。
6. **启动预热 + 定时刷新**：服务启动后台拉一次；交易时段每 60s 刷新，非交易时段 5–10 分钟（收盘价不变）。
7. **前端本地筛选**：过滤/排序/分页全在内存完成（5500 行），配虚拟滚动与 `useMemo`，避免主线程卡顿。
8. **失败不阻塞**：腾讯单次超时（>2s 未回）即降级（见 §五），保证用户始终能在 3s 内看到「结果或明确错误」。

---

## 四、需先修复的既有实现问题（关键）

在 `backend/astock.py` 落地前，必须处理以下三点，否则全市场筛选会静默出错：

| # | 位置 | 问题 | 影响 | 修复 |
|---|------|------|------|------|
| 1 | `get_prefix()`（`astock.py:28`） | `code.startswith(("6","9","5"))` → 北交所 **920xxx** 以 `9` 开头被误判为 `sh` | 343 只北交所标的取到空/错数据 | 按 `SKILL.md` §1.2：**`92*` → bj 必须先于 `9x` 判断**；`4/8/83/87` → bj，其余按 6/5→sh、默认 sz |
| 2 | `_parse_gtimg()`（`astock.py:52`） | 未解析 **字段 61 `security_type`** | 无法剔除 ETF/指数/可转债 | 补 `"security_type": vals[61]`，筛选时只留 `GP-A*` |
| 3 | `_parse_gtimg()` | 未计算 **`is_stale`** | 停牌/废码僵尸报价（量 0、现价==昨收）被当真实价 | 补 `is_stale = amount==0 and price==last_close and price>0` |
| 4 | `_fetch_gtimg()` / `tencent_quote()` | 单 URL 拼全部代码；全市场 URL 过长 | 全市场一次请求不可行 | 新增分块逻辑（500/块），供 `screener_snapshot` 使用 |

> 字段口径提醒（`SKILL.md` §1.2 踩坑）：**44=流通市值、45=总市值**（曾标反）；43=振幅% 不是 PB，PB 在 46。现有 `_parse_gtimg` 已正确使用 44/45，保持即可。

---

## 五、备源与降级

| 环节 | 失败表现 | 降级动作 |
|------|----------|----------|
| 腾讯批量 | 超时 / 连续请求返回空（限流） | 先返回**上一次好快照**并标 `as_of` + 「可能过期」；无缓存则返回 502 由前端显示错误态 + 重试 |
| 腾讯长期异常 | 持续失败 | 备用行情源：交易所官方（沪 `yunhq.sse.com.cn:32041`、深 `szse.cn/api/market/...`）或新浪（见 `SKILL.md`「备用源速查」） |
| 巨潮代码表 | 拉取失败 | 仅影响每日刷新与 `orgId`，**不影响筛选**；沿用上一份代码表 |
| mootdx 财务（ROE） | 未安装 / 超时 | ROE 列显示「—」+ 原因（`DependencyMissing` 提示 `pip install mootdx`），其余功能不受影响 |
| 北交所老号段 | 定格脏数据 | 只用本地表/巨潮现行码；`is_stale` 命中即剔除 |

---

## 六、伪代码（后端落地骨架）

```python
# ---- backend/astock.py 追加 ----
# 复用既有 tencent_quote / _parse_gtimg / get_prefix（先按 §四 修 get_prefix 与字段解析）

def screener_snapshot(codes: list[str], batch: int = 500) -> dict[str, dict]:
    """全市场快照：分块 500 调腾讯批量，返回 {code: 行情+估值}。"""
    out = {}
    for i in range(0, len(codes), batch):
        chunk = codes[i:i + batch]
        out.update(tencent_quote(chunk))   # 内部复用 Keep-Alive 会话
    return out

def screener_roe(code: str) -> float | None:
    """单只 ROE（mootdx finance 37 字段之一）。"""
    fin = finance(code)
    return fin.get("roe")
```

```python
# ---- backend/app.py ----
_SNAP = {"data": None, "at": 0.0}
_SNAP_TTL = 60.0

@app.get("/api/screener/snapshot")
def screener_snapshot_api():
    now = _time.time()
    cached = _SNAP["data"]
    if cached and now - _SNAP["at"] < _SNAP_TTL:
        return {"data": cached}                       # 热缓存 <50ms
    if cached:                                        # stale-while-revalidate
        threading.Thread(target=_refresh_snapshot, daemon=True).start()
        return {"data": {**cached, "stale": True}}
    data = _build_snapshot()                          # 冷路径 1.9–2.4s
    _SNAP.update(data=data, at=now)
    return {"data": data}

@app.get("/api/screener/enrich")
def screener_enrich(codes: str = Query(...), groups: str = "roe"):
    lst = [c.strip() for c in codes.split(",") if c.strip()][:50]
    if groups != "roe":
        raise HTTPException(400, "本期仅支持 groups=roe")
    return {"data": {c: {"roe": astock.screener_roe(c)} for c in lst}}
```

---

## 七、一页速览

- **调用哪些 API**：`§1.2 tencent_quote`（全市场行情+估值，关键路径）、`§6.1 mootdx finance`（ROE，异步）、`§7.1 巨潮 szse_stock.json`（后台刷新，可选）；**不调用任何东财端点**。
- **调用路径**：本地表 →（命中缓存？）→ 腾讯分块 500 批量 → 解析合并 → gzip 返回 → 前端本地过滤 → 异步 ROE。
- **3s 达成**：冷启动服务端 1.9–2.4s，热缓存 <50ms，前端过滤 <50ms；ROE 不占预算。
- **前置修复**：`get_prefix` 的 920 号段判定、`security_type`/`is_stale` 解析、腾讯分块——先修再落地筛选页。

---

## 八、实现落地记录（与本文差异）

页面已按本方案实现，落地时有三点工程化调整：

1. **`is_stale` 改为「批内相对新鲜度」判定**：`_parse_gtimg` 仍按「成交额=0 且现价==昨收」给出基础 `is_stale`，但 `_build_screener_payload` 再以本批行情时间戳（字段 30）的**最新日期**为基准，只有报价日期落后于全市场最新日期的才算真·停牌/废码。避免盘前/收盘后把正常个股误判为僵尸、导致默认「排除停牌」把结果清空。
2. **mootdx 增加 `tdx_client` 封装（移植自 SKILL）**：修复 0.11.x `BESTIP.HQ` 空串导致的 `ValueError: not enough values to unpack`；显式 server + 真实取数验活 + 5 分钟熔断 + 守护线程限时，坏网络下 ROE 快速失败（返回 502 → 前端显示「ROE 暂不可用」），不拖垮页面。
3. **ROE 增强按当前页（≤50 只）拉取**：后端 4 路并发 + 12h 缓存；前端在结果渲染后异步加载，ROE 列加载中显示骨架条。东财类深度条件均未接入（见设计文档 §4.3）。
4. **首屏实测**：全市场 5562 只快照冷启动约 0.9–1.1s、热缓存约 0.1s；响应 gzip 后约 850KB。北交所 343 只（920xxx）取数正常。
