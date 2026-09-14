"""A股全栈数据层 —— 移植自 a-stock-data 工具包（五层数据源，自包含）。

分级依赖：
  - 行情（腾讯）        : 仅需标准库 urllib —— 永远可用
  - 研报（东财）+ PDF   : 仅需 requests —— 轻量必装
  - 一致预期/新闻/公告  : akshare（惰性导入，缺失时优雅报错）
  - K线/财务/F10        : mootdx（惰性导入，缺失时优雅报错）

合规：本模块只按用户传入的代码返回客观数据，不预置任何标的、不排名、不建议。
"""

from __future__ import annotations

import csv
import math
import json
import os
import random
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"


def get_prefix(code: str) -> str:
    """6 位代码 → 交易所前缀。

    ⚠️ 顺序敏感：北交所 920 新号段以 "92" 开头，必须先于 "9x → sh" 判断，
    否则 920xxx 会被当成沪市、取到空数据（见 a-stock-data SKILL §1.2）。
    北交所老号段 4/8（43/83/87）同样归 bj；5 开头是沪市基金/ETF；深市走默认 sz。
    """
    if code.startswith(("92", "4", "8")):
        return "bj"
    if code.startswith(("6", "9", "5")):
        return "sh"
    return "sz"


class DependencyMissing(RuntimeError):
    """惰性依赖未安装时抛出，前端据此提示 pip install。"""


# ---------------------------------------------------------------------------
# Layer 1 · 行情（腾讯财经，仅标准库，不封 IP）
# ---------------------------------------------------------------------------

def _fetch_gtimg(prefixed_codes: list[str]) -> str:
    url = "https://qt.gtimg.cn/q=" + ",".join(prefixed_codes)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return resp.read().decode("gbk")


def _parse_gtimg(data: str) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for line in data.strip().split(";"):
        if not line.strip() or "=" not in line or '"' not in line:
            continue
        key = line.split("=")[0].split("_")[-1]
        vals = line.split('"')[1].split("~")
        if len(vals) < 53:
            continue
        code = key[2:]

        def num(i: int) -> float:
            try:
                return float(vals[i]) if vals[i] else 0.0
            except (ValueError, IndexError):
                return 0.0

        result[code] = {
            "name": vals[1],
            "price": num(3),
            "last_close": num(4),
            "open": num(5),
            "change_amt": num(31),
            "change_pct": num(32),
            "high": num(33),
            "low": num(34),
            "amount_wan": num(37),
            "turnover_pct": num(38),
            "pe_ttm": num(39),
            "amplitude_pct": num(43),
            # 腾讯 qt.gtimg 字段 44=流通市值、45=总市值（此前标反，导致「总市值」实为流通市值）
            "mcap_yi": num(45),
            "float_mcap_yi": num(44),
            "pb": num(46),
            "limit_up": num(47),
            "limit_down": num(48),
            "vol_ratio": num(49),
            "pe_static": num(52),
            # 字段 30=行情时间戳 YYYYMMDDHHMMSS（用于判断报价新鲜度）。
            "ts": vals[30] if len(vals) > 30 else "",
            # 字段 61=证券类型（GP-A / GP-A-CYB / GP-A-KCB / GP(北交所) / ZS 指数 / ETF），
            # 筛选页据此剔除 ETF/指数/可转债。
            "security_type": vals[61] if len(vals) > 61 else "",
        }
        # 僵尸报价：退市/长期停牌股腾讯仍返回定格价（成交量为 0、现价==昨收）。
        q = result[code]
        q["is_stale"] = bool(
            q["amount_wan"] == 0 and q["price"] > 0 and q["price"] == q["last_close"]
        )
    return result


def tencent_quote(codes: list[str]) -> dict[str, dict]:
    """批量个股实时行情：现价 / 涨跌 / PE / PB / 市值 / 换手 / 涨跌停。"""
    prefixed = [f"{get_prefix(c)}{c}" for c in codes]
    return _parse_gtimg(_fetch_gtimg(prefixed))


# 腾讯单 URL 拼码上限（实测 ≤800 可用；2000 会被拒）。全市场用 500/块最稳。
_TENCENT_BATCH = 500
_TENCENT_WORKERS = 4


def tencent_quote_batch(
    codes: list[str], batch: int = _TENCENT_BATCH, workers: int = _TENCENT_WORKERS
) -> dict[str, dict]:
    """全市场批量实时行情：分块 500 + 受控并发拉取腾讯（不封 IP）。

    单块失败不影响其余块（该块标的在结果里缺失，由调用方按「未获取」处理）。
    返回 {code: 行情}，键为 6 位代码。
    """
    if not codes:
        return {}
    chunks = [codes[i : i + batch] for i in range(0, len(codes), batch)]
    result: dict[str, dict] = {}
    if len(chunks) == 1:
        return _parse_gtimg(_fetch_gtimg([f"{get_prefix(c)}{c}" for c in chunks[0]]))
    with ThreadPoolExecutor(max_workers=max(1, min(workers, len(chunks)))) as pool:
        futures = {
            pool.submit(_fetch_gtimg, [f"{get_prefix(c)}{c}" for c in ch]): ch
            for ch in chunks
        }
        for fut in as_completed(futures):
            try:
                result.update(_parse_gtimg(fut.result()))
            except Exception:  # noqa: BLE001 — 单块失败降级，不拖垮整批
                continue
    return result


# 筛选页宇宙：本地静态表（代码/名称/行业/地区/板块/上市日），零网络、启动后常驻内存。
# 与前端 frontend/src/data/stock_codes.csv 同源。
_A_SHARE_MARKETS = {"主板", "中小板", "创业板", "科创板", "北交所"}
_UNIVERSE_PATH = (
    Path(__file__).resolve().parent.parent / "frontend" / "src" / "data" / "stock_codes.csv"
)
_universe_cache: list[dict] | None = None


def a_share_universe() -> list[dict]:
    """全市场 A 股基础表（沪深京，剔除港股/美股）。

    返回 [{code, name, industry, area, board, list_date}]，模块级缓存（进程内只读一次）。
    文件缺失/异常时返回 []，由调用方报错，不伪造数据。
    """
    global _universe_cache
    if _universe_cache is not None:
        return _universe_cache
    rows: list[dict] = []
    try:
        with _UNIVERSE_PATH.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                board = (r.get("market") or "").strip()
                code = (r.get("code") or "").strip()
                if board not in _A_SHARE_MARKETS:
                    continue
                if not code.isdigit() or len(code) != 6:
                    continue
                rows.append({
                    "code": code,
                    "name": (r.get("name") or "").strip(),
                    "industry": (r.get("industry") or "").strip(),
                    "area": (r.get("area") or "").strip(),
                    "board": board,
                    "list_date": (r.get("list_date") or "").strip(),
                })
    except Exception:  # noqa: BLE001 — 读不到就当空，调用方据此报错
        rows = []
    _universe_cache = rows
    return rows


# 腾讯日K线（后复权），不走 mootdx/akshare 等外部依赖
def tencent_kline(code: str, offset: int = 120) -> list[dict]:
    """腾讯财经日K线（前复权），返回 [{close, open, high, low, volume, date}]。"""
    prefix = get_prefix(code)
    url = f"http://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={prefix}{code},day,,,{offset},qfq"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=10) as resp:
        body = resp.read()
    data = json.loads(body.decode("utf-8"))
    raw = data.get("data", {}).get(f"{prefix}{code}", {})
    bars = raw.get("qfqday", raw.get("day", []))
    out = []
    for b in bars:
        if not b or len(b) < 2:
            continue
        # 腾讯日K行格式：[日期, 开盘, 收盘, 最高, 最低, 成交量, ...]（akshare 同口径）。
        # ⚠️ 此前 close=b[1]、open=b[2] 恰好颠倒，导致涨跌判定/蜡烛颜色正好反过来（跌标红、涨标绿）。
        date = b[0]
        open_ = float(b[1])
        close_ = float(b[2]) if len(b) > 2 else open_
        out.append({
            "close": close_,
            "open": open_,
            "high": float(b[3]) if len(b) > 3 else close_,
            "low": float(b[4]) if len(b) > 4 else close_,
            "volume": int(float(b[5])) if len(b) > 5 else 0,
            "date": date,
        })
    return out


# A股大盘指数（前缀规则与个股不同，固定带前缀代码）
A_INDICES = ["sh000001", "sz399001", "sz399006", "sh000300"]


def index_quote() -> list[dict]:
    """A股大盘指数实时行情（上证/深证成指/创业板指/沪深300）。"""
    parsed = _parse_gtimg(_fetch_gtimg(A_INDICES))
    out = []
    for full in A_INDICES:
        q = parsed.get(full[2:])
        if q:
            out.append({"name": q["name"], "price": q["price"], "change_pct": q["change_pct"], "change_amt": q["change_amt"]})
    return out


# ---------------------------------------------------------------------------
# Layer 2 · 研报（东财 reportapi，仅 requests）
# ---------------------------------------------------------------------------

_REPORT_API = "https://reportapi.eastmoney.com/report/list"
_PDF_TPL = "https://pdf.dfcfw.com/pdf/H3_{info_code}_1.pdf"


def _report_session():
    import requests  # 轻依赖，随后端一起装

    s = requests.Session()
    s.headers.update({"User-Agent": UA, "Referer": "https://data.eastmoney.com/"})
    return s


def eastmoney_reports(code: str, max_pages: int = 3, page: int | None = None,
                      page_size: int = 100) -> dict:
    """按个股代码拉研报列表（东财 reportapi，qType=0），返回分页信封。

    返回 {items, page, page_size, total, total_pages}（total=命中总数 hits，total_pages=TotalPage）。
    - 传 page：只拉该单页（每页 page_size），用于页面分页；
    - 默认：从第 1 页起连续拉 max_pages 页（每页 100），items 为聚合结果——供 AI 工具等使用。
    """
    session = _report_session()

    def _fetch(pno: int, psize: int) -> dict:
        params = {
            "industryCode": "*", "pageSize": str(psize), "industry": "*",
            "rating": "*", "ratingChange": "*",
            "beginTime": "2000-01-01", "endTime": "2030-01-01",
            "pageNo": str(pno), "fields": "", "qType": "0",
            "orgCode": "", "code": code, "rcode": "",
            "p": str(pno), "pageNum": str(pno), "pageNumber": str(pno),
        }
        return session.get(_REPORT_API, params=params, timeout=30).json()

    def _env(items: list, pno: int, psize: int, d: dict) -> dict:
        try:
            total = int(d.get("hits") or 0)
        except (TypeError, ValueError):
            total = 0
        try:
            tpages = int(d.get("TotalPage") or 0)
        except (TypeError, ValueError):
            tpages = 0
        return {"items": items, "page": pno, "page_size": psize, "total": total, "total_pages": tpages}

    if page is not None:
        pno, psize = max(1, page), max(1, page_size)
        d = _fetch(pno, psize)
        return _env(d.get("data") or [], pno, psize, d)

    out: list[dict] = []
    last = {}
    for pno in range(1, max_pages + 1):
        d = _fetch(pno, 100)
        last = d
        rows = d.get("data") or []
        if not rows:
            break
        out.extend(rows)
        if pno >= (d.get("TotalPage", 1) or 1):
            break
        time.sleep(0.3)
    return _env(out, 1, len(out) or 100, last)


def eastmoney_industry_reports(keywords: list[str] | None = None, days: int = 90, max_pages: int = 3) -> list[dict]:
    """按行业拉研报（qType=1）——适合产业链 / 主题级检索。keywords 在标题上过滤。"""
    from datetime import date, timedelta

    session = _report_session()
    end = date.today()
    begin = end - timedelta(days=days)
    out: list[dict] = []
    for page in range(1, max_pages + 1):
        params = {
            "industryCode": "*", "pageSize": "100", "industry": "*",
            "rating": "*", "ratingChange": "*",
            "beginTime": begin.isoformat(), "endTime": end.isoformat(),
            "pageNo": str(page), "fields": "", "qType": "1",
            "orgCode": "", "code": "", "rcode": "",
        }
        r = session.get(_REPORT_API, params=params, timeout=30)
        rows = r.json().get("data") or []
        if not rows:
            break
        out.extend(rows)
        time.sleep(0.3)
    if keywords:
        out = [r for r in out if any(k in r.get("title", "") for k in keywords)]
    return out


def pdf_url(info_code: str) -> str:
    return _PDF_TPL.format(info_code=info_code)


# ---------------------------------------------------------------------------
# Layer 3/4/5 · akshare 惰性封装（一致预期 / 新闻 / 公告 / 基本面）
# ---------------------------------------------------------------------------

def _akshare():
    try:
        import akshare as ak
        return ak
    except ImportError as e:
        raise DependencyMissing("akshare 未安装：pip install akshare") from e


def profit_forecast(code: str) -> list[dict]:
    """机构一致预期 EPS（同花顺）。"""
    ak = _akshare()
    df = ak.stock_profit_forecast_ths(symbol=code, indicator="预测年报每股收益")
    return df.to_dict("records") if df is not None and not df.empty else []


def stock_news(code: str, limit: int = 20, page: int = 1) -> dict:
    """个股新闻（东财 search-api-web JSONP，移植自 a-stock-data §5.1）。

    返回分页信封 {items, page, page_size, total, total_pages}，items 每项
    {关键词, 新闻标题, 新闻内容, 发布时间, 文章来源, 新闻链接}（键名与 akshare
    stock_news_em 一致）。page 用于翻更早的新闻。
    ⚠️ 不走 ak.stock_news_em：它对部分代码（如 600848）会抛
    ArrowInvalid('invalid escape sequence: \\u') 导致新闻恒为空。
    """
    pno, psize = max(1, page), max(1, limit)
    url = "https://search-api-web.eastmoney.com/search/jsonp"
    inner = json.dumps({
        "uid": "", "keyword": code, "type": ["cmsArticleWebOld"],
        "client": "web", "clientType": "web", "clientVersion": "curr",
        "param": {"cmsArticleWebOld": {
            "searchScope": "default", "sort": "default",
            "pageIndex": pno, "pageSize": psize, "preTag": "", "postTag": "",
        }},
    }, separators=(",", ":"))
    try:
        r = em_get(url, params={"cb": "jQuery_news", "param": inner},
                   headers={"User-Agent": UA, "Referer": "https://so.eastmoney.com/"}, timeout=15)
        text = r.text
        payload = json.loads(text[text.index("(") + 1: text.rindex(")")])
    except Exception:
        return {"items": [], "page": pno, "page_size": psize, "total": 0, "total_pages": 0}
    # 东财实际返回里 result.cmsArticleWebOld 直接是文章列表（并非 {list: [...]} 嵌套）
    articles = (payload.get("result") or {}).get("cmsArticleWebOld") or []
    out = []
    for a in articles[:psize]:
        out.append({
            "关键词": code,
            "新闻标题": re.sub(r"<[^>]+>", "", a.get("title", "") or ""),
            "新闻内容": re.sub(r"<[^>]+>", "", a.get("content", "") or "")[:200],
            "发布时间": a.get("date", ""),
            "文章来源": a.get("mediaName", ""),
            "新闻链接": a.get("url", ""),
        })
    try:
        total = int(payload.get("hitsTotal") or 0)
    except (TypeError, ValueError):
        total = 0
    return {"items": out, "page": pno, "page_size": psize, "total": total,
            "total_pages": (total + psize - 1) // psize if total else 0}


def individual_info(code: str) -> dict:
    """公司基本档案（东财 push2 直连，移植自 a-stock-data §6.3）。

    返回 {code, name, industry, total_shares(股), float_shares(股),
    mcap(元), float_mcap(元), list_date(YYYY-MM-DD), price}。
    ⚠️ 不用 akshare stock_individual_info_em：它内部用裸 requests，会走系统代理导致
    ProxyError/502；这里统一走 em_get（直连优先、失败降级代理）。
    """
    market_code = 1 if code.startswith("6") else 0
    params = {
        "fltt": "2", "invt": "2",
        "fields": "f57,f58,f84,f85,f116,f117,f127,f128,f189,f174,f175,f43",
        "secid": f"{market_code}.{code}",
    }
    # push2(实时) 不可达时降级 push2delay(延迟行情)，与 market_turnover_rank 同策略
    d: dict = {}
    for host in ("push2.eastmoney.com", "push2delay.eastmoney.com"):
        try:
            d = em_get(f"https://{host}/api/qt/stock/get",
                       params=params, headers={"User-Agent": UA}, timeout=10).json().get("data") or {}
            if d:
                break
        except Exception:
            continue
    if not d:
        return {}

    def _f(v):
        return v if isinstance(v, (int, float)) else None

    raw_date = str(d.get("f189") or "")
    list_date = (f"{raw_date[:4]}-{raw_date[4:6]}-{raw_date[6:]}"
                 if len(raw_date) == 8 and raw_date.isdigit() else "")
    return {
        "code": str(d.get("f57") or code),
        "name": d.get("f58", "") or "",
        "industry": d.get("f127", "") or "",   # 所属行业
        "board": d.get("f128", "") or "",      # 所属板块（如「上海板块」）
        "total_shares": _f(d.get("f84")),      # 总股本(股)
        "float_shares": _f(d.get("f85")),      # 流通股(股)
        "mcap": _f(d.get("f116")),             # 总市值(元)
        "float_mcap": _f(d.get("f117")),       # 流通市值(元)
        "week52_high": _f(d.get("f174")),      # 52周最高
        "week52_low": _f(d.get("f175")),       # 52周最低
        "list_date": list_date,                # 上市日期 YYYY-MM-DD
        "price": _f(d.get("f43")),
    }


_CNINFO_ORGID_MAP: dict[str, str] = {}


def _cninfo_orgid(code: str) -> str:
    """巨潮 股票代码 → 真实 orgId（移植自 a-stock-data §7.1，模块级缓存）。

    巨潮 orgId 并非统一格式（如 600848→gssh0600848、601318→9900002221），硬编码
    `gssx0{code}` 会让大量股票（尤其 601xxx 段）返回 0 条公告；故优先查官方映射表，
    查不到再回退老格式。
    """
    global _CNINFO_ORGID_MAP
    if not _CNINFO_ORGID_MAP:
        import requests
        try:
            r = requests.get("http://www.cninfo.com.cn/new/data/szse_stock.json",
                             headers={"User-Agent": UA}, timeout=15)
            _CNINFO_ORGID_MAP = {s["code"]: s["orgId"] for s in r.json().get("stockList", [])}
        except Exception:
            _CNINFO_ORGID_MAP = {}
    org = _CNINFO_ORGID_MAP.get(code)
    if org:
        return org
    if code.startswith("6"):
        return f"gssh0{code}"
    if code.startswith(("8", "4")):
        return f"gsbj0{code}"
    return f"gssz0{code}"


def disclosure(code: str, limit: int = 15, page: int = 1) -> dict:
    """巨潮公告（直连 cninfo.com.cn 官方全文检索，移植自 a-stock-data §7.1）。

    返回分页信封 {items, page, page_size, total, total_pages}，items 每项
    {date, title, type, url, pdf_url}（pdf_url 为公告 PDF 直链，可下载；url 为巨潮详情页）。
    page 用于翻更早的公告。
    ⚠️ 不用 akshare stock_zh_a_disclosure_report_cninfo（本环境不稳）。
    """
    import requests

    pno, psize = max(1, page), max(1, limit)
    payload = {
        "stock": f"{code},{_cninfo_orgid(code)}",
        "tabName": "fulltext", "pageSize": str(psize), "pageNum": str(pno),
        "column": "", "category": "", "plate": "", "seDate": "",
        "searchkey": "", "secid": "", "sortName": "", "sortType": "", "isHLtitle": "true",
    }
    try:
        r = requests.post(
            "https://www.cninfo.com.cn/new/hisAnnouncement/query", data=payload,
            headers={"User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded",
                     "Referer": "https://www.cninfo.com.cn/new/disclosure",
                     "Origin": "https://www.cninfo.com.cn"}, timeout=15)
        d = r.json()
        items = d.get("announcements") or []
    except Exception:
        return {"items": [], "page": pno, "page_size": psize, "total": 0, "total_pages": 0}
    out = []
    for a in items:
        ts = a.get("announcementTime")
        date = (datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
                if isinstance(ts, (int, float)) else str(ts or "")[:10])
        adj = a.get("adjunctUrl") or ""
        aid = a.get("announcementId") or ""
        out.append({
            "date": date,
            "title": a.get("announcementTitle", "") or "",
            "type": a.get("announcementTypeName") or "",
            "url": f"https://www.cninfo.com.cn/new/disclosure/detail?annoId={aid}" if aid else "",
            "pdf_url": f"https://static.cninfo.com.cn/{adj}" if adj else "",
        })
    try:
        total = int(d.get("totalAnnouncement") or 0)
    except (TypeError, ValueError):
        total = 0
    try:
        tpages = int(d.get("totalpages") or 0)
    except (TypeError, ValueError):
        tpages = 0
    return {"items": out, "page": pno, "page_size": psize, "total": total,
            "total_pages": tpages or ((total + psize - 1) // psize if total else 0)}


def announcements(code: str, limit: int = 15) -> list[dict]:
    """个股近期公告（东财公开接口，仅 requests，稳定）。返回 日期/标题/类型/详情链接。"""
    import requests

    r = requests.get(
        "https://np-anotice-stock.eastmoney.com/api/security/ann",
        params={"sr": -1, "page_size": limit, "page_index": 1, "ann_type": "A",
                "client_source": "web", "stock_list": code, "f_node": 0, "s_node": 0},
        headers={"User-Agent": UA}, timeout=20,
    )
    lst = (r.json().get("data") or {}).get("list") or []
    out = []
    for a in lst:
        cols = [c.get("column_name") for c in (a.get("columns") or []) if c.get("column_name")]
        art = a.get("art_code", "")
        out.append({
            "date": (a.get("notice_date", "") or "")[:10],
            "title": a.get("title", ""),
            "type": cols[0] if cols else "",
            "url": f"https://data.eastmoney.com/notices/detail/{code}/{art}.html" if art else "",
        })
    return out


# ---------------------------------------------------------------------------
# mootdx 惰性封装（K线 / 财务 / F10）
# ---------------------------------------------------------------------------
# mootdx 0.11.x 全新安装后 BESTIP.HQ 为空串，裸 Quotes.factory(market='std')
# 会抛 `ValueError: not enough values to unpack`。移植 a-stock-data SKILL 的 tdx_client()：
# 显式 server 绕过 BESTIP，并做 TCP 探测 + 真实取数验活。解析成功的 server 进程内缓存，
# 后续直接复用（不再逐次探测）。每个调用新建 client，避免多线程共享 socket。
_TDX_SERVERS = [
    ("119.97.185.59", 7709), ("124.70.133.119", 7709), ("116.205.183.150", 7709),
    ("123.60.73.44", 7709), ("116.205.163.254", 7709), ("121.36.225.169", 7709),
    ("123.60.70.228", 7709), ("124.71.9.153", 7709), ("110.41.147.114", 7709),
    ("124.71.187.122", 7709),
]
_tdx_server: tuple[str, int] | None = None   # 已验证可用的 server
_tdx_use_default = False                      # 全部候选不可用时，回退裸 factory 可用
_tdx_fail_at = 0.0                            # 上次解析失败时间（熔断，避免每请求都等满超时）
_TDX_FAIL_COOLDOWN = 300.0
_TDX_RESOLVE_TIMEOUT = 4.0
_tdx_resolve_lock = threading.Lock()          # 同一时刻只允许一个线程解析 server


def _tdx_validate(client, market: str = "std") -> bool:
    """真实取数验活：坏 server 可握手通过却回空 body（静默空表），用一次 K 线请求兜底。"""
    if market != "std":
        return True
    try:
        df = client.bars(symbol="000001", frequency=9, offset=1)
        return df is not None and not df.empty
    except Exception:
        return False


def _bounded(fn, timeout: float):
    """在守护线程里执行 fn，最多等 timeout 秒；超时返回 _TIMEOUT。

    用于 mootdx：其 socket 读取无超时，某些网络下连接建立成功但取数永久阻塞。
    守护线程不会阻塞进程退出。
    """
    box: dict = {}

    def _run() -> None:
        try:
            box["value"] = fn()
        except BaseException as e:  # noqa: BLE001 — 原样带回给调用方
            box["error"] = e

    t = threading.Thread(target=_run, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        return _TIMEOUT
    if "error" in box:
        raise box["error"]
    return box.get("value")


_TIMEOUT = object()


def _resolve_server(Quotes, candidates: list[tuple[str, int]], timeout: float):
    """并行尝试候选 server，返回第一个验活成功的 (ip, port, client)；全部失败返回 None。

    尝试跑在守护线程里，整体最多等 timeout 秒（坏网络下连接建立但取数阻塞，故必须限时）。
    """
    found: list[tuple[str, int, object]] = []
    lock = threading.Lock()
    done = threading.Event()

    def _attempt(ip: str, port: int) -> None:
        if done.is_set():
            return
        try:
            client = Quotes.factory(market="std", server=(ip, port))
            if _tdx_validate(client):
                with lock:
                    if not found:
                        found.append((ip, port, client))
                done.set()
        except Exception:
            pass

    threads = [threading.Thread(target=_attempt, args=(ip, port), daemon=True) for ip, port in candidates]
    for t in threads:
        t.start()
    done.wait(timeout)
    return found[0] if found else None


def _tdx_new_client():
    """创建 mootdx std 客户端，规避 BESTIP 空串 bug + 坏服务器静默空表。

    - 同一时刻只允许一个线程解析（其余线程最多等 5s，随后按失败处理），
      避免坏网络下每只股票都重跑一遍解析；
    - 并行尝试显式 server，取第一个验活成功的并缓存；
    - 都不可达时试 bestip / 裸 factory（各限时）；
    - 整体失败进入 5 分钟熔断（海外网络 TCP 7709 常不可达）。
    """
    from mootdx.quotes import Quotes

    global _tdx_server, _tdx_use_default, _tdx_fail_at
    if _tdx_server is not None:
        return Quotes.factory(market="std", server=_tdx_server)
    if _tdx_use_default:
        return Quotes.factory(market="std")
    if time.time() - _tdx_fail_at < _TDX_FAIL_COOLDOWN:
        raise RuntimeError("mootdx 服务器暂不可用（冷却中，请稍后重试）")

    if not _tdx_resolve_lock.acquire(timeout=5.0):
        raise RuntimeError("mootdx 服务器解析中，请稍后重试")
    try:
        if _tdx_server is not None:
            return Quotes.factory(market="std", server=_tdx_server)
        if _tdx_use_default:
            return Quotes.factory(market="std")
        if time.time() - _tdx_fail_at < _TDX_FAIL_COOLDOWN:
            raise RuntimeError("mootdx 服务器暂不可用（冷却中，请稍后重试）")

        hit = _resolve_server(Quotes, _TDX_SERVERS, timeout=_TDX_RESOLVE_TIMEOUT)
        if hit is not None:
            ip, port, client = hit
            _tdx_server = (ip, port)
            return client

        for kwargs in ({"bestip": True},):
            client = _bounded(lambda kw=kwargs: Quotes.factory(market="std", **kw), timeout=3.0)
            if client is not _TIMEOUT and _bounded(lambda c=client: _tdx_validate(c), timeout=2.0) is True:
                _tdx_use_default = True
                return client

        _tdx_fail_at = time.time()
        raise RuntimeError("所有 mootdx 服务器均无法取到数据（TCP 7709 不可达或被 reset）")
    finally:
        _tdx_resolve_lock.release()


def _mootdx_client():
    try:
        return _tdx_new_client()
    except ImportError as e:
        raise DependencyMissing("mootdx 未安装：pip install mootdx") from e


def kline(code: str, category: int = 4, offset: int = 60) -> list[dict]:
    """K线：category 4=日 5=周 6=月 11=60分钟。

    日K (category=4) 优先使用腾讯复权K线（零依赖），其余走 mootdx。
    腾讯日K不受代理限制，兼容性好。
    """
    if category == 4:
        try:
            return tencent_kline(code, offset)
        except Exception:
            pass
    try:
        client = _mootdx_client()
        df = client.bars(symbol=code, category=category, offset=offset)
        return df.to_dict("records") if df is not None and not df.empty else []
    except Exception:
        return []


def finance(code: str) -> dict:
    """季报财务快照（37 字段）。"""
    client = _mootdx_client()
    df = client.finance(symbol=code)
    if df is None or (hasattr(df, "empty") and df.empty):
        return {}
    return df.to_dict("records")[0] if hasattr(df, "to_dict") else dict(df)


# ROE 单只缓存：季报口径变化慢，缓存 12 小时足够；避免筛选页反复拉取同一批股票。
_ROE_CACHE: dict[str, tuple[float, float | None]] = {}
_ROE_TTL = 12 * 3600


def screener_roe(code: str) -> float | None:
    """单只 ROE（mootdx finance 37 字段之一）。

    带 12h 进程内缓存；取不到返回 None（不伪造、不用旧值冒充）。
    依赖缺失时抛 DependencyMissing、数据源不可用时抛 RuntimeError，由接口层分类处理；
    单只取数超时则记 None（避免拖垮整批）。
    """
    hit = _ROE_CACHE.get(code)
    now = time.time()
    if hit and now - hit[0] < _ROE_TTL:
        return hit[1]
    fin = _bounded(lambda: finance(code), timeout=10.0)
    if fin is _TIMEOUT:
        _ROE_CACHE[code] = (now, None)
        return None
    roe = fin.get("roe")
    try:
        roe = float(roe) if roe is not None and str(roe).strip() != "" else None
    except (TypeError, ValueError):
        roe = None
    _ROE_CACHE[code] = (now, roe)
    return roe


# ---------------------------------------------------------------------------
# 估值计算
# ---------------------------------------------------------------------------

def calc_peg(pe: float, cagr: float) -> float:
    if cagr <= 0:
        return float("inf")
    return pe / (cagr * 100)


def pe_digestion(current_pe: float, cagr: float, target_pe: float = 30) -> float:
    if current_pe <= target_pe:
        return 0.0
    if cagr <= 0:
        return float("inf")
    return math.log(current_pe / target_pe) / math.log(1 + cagr)


def financials(code: str) -> dict:
    """财务关键指标（同花顺财务摘要，最新报告期）—— 干净可靠的营收/净利/ROE/毛利率等。

    注：mootdx finance() 的营收/净利数值不可靠(实测放大数倍)，故财务摘要走此源。
    """
    ak = _akshare()
    df = ak.stock_financial_abstract_ths(symbol=code, indicator="按报告期")
    if df is None or df.empty:
        return {}
    row = df.iloc[-1].to_dict()  # 最新报告期（按报告期升序，取末行）

    def g(k):
        v = row.get(k)
        return None if v in (False, "false", "", None) else v

    return {
        "period": g("报告期"),
        "revenue": g("营业总收入"), "revenue_yoy": g("营业总收入同比增长率"),
        "net_profit": g("净利润"), "net_profit_yoy": g("净利润同比增长率"),
        "eps": g("基本每股收益"), "bvps": g("每股净资产"),
        "roe": g("净资产收益率"), "gross_margin": g("销售毛利率"), "net_margin": g("销售净利率"),
        "op_cf_ps": g("每股经营现金流"),
    }


def valuation_percentile(code: str, period: str = "近五年") -> dict:
    """历史估值分位（百度股市通）：PE-TTM / PB 的当前值 + 历史 20/50/80 分位带 + 所处分位。

    只表达"处于历史什么位置"，不划买卖线（理杏仁式中立呈现）。
    """
    ak = _akshare()

    def _q(vals: list, p: float) -> float:
        if not vals:
            return 0.0
        idx = p * (len(vals) - 1)
        lo = int(idx)
        if lo + 1 >= len(vals):
            return vals[-1]
        frac = idx - lo
        return vals[lo] * (1 - frac) + vals[lo + 1] * frac

    metrics = {}
    for key, ind in (("pe_ttm", "市盈率(TTM)"), ("pb", "市净率"), ("mcap", "总市值")):
        try:
            df = ak.stock_zh_valuation_baidu(symbol=code, indicator=ind, period=period)
            raw = df.iloc[:, 1].dropna().astype(float).tolist()
            if not raw:
                continue
            cur = float(raw[-1])
            s = sorted(raw)
            below = sum(1 for x in s if x < cur)
            metrics[key] = {
                "current": round(cur, 2),
                "percentile": round(below / max(len(s) - 1, 1) * 100, 1),
                "min": round(s[0], 2), "max": round(s[-1], 2),
                "p20": round(_q(s, 0.2), 2), "p50": round(_q(s, 0.5), 2), "p80": round(_q(s, 0.8), 2),
                "n": len(s),
            }
        except Exception:
            continue

    # ROE 历史分位（东财财务指标，近 5 年年报值）。百度股市通估值接口不支持 ROE，
    # 故单独走东财主要财务指标接口。ROE 与 PE/PB 方向相反：值越大=越低估。
    try:
        dfr = ak.stock_financial_analysis_indicator(symbol=code, start_year="2021")
        if not dfr.empty and "净资产收益率(%)" in dfr.columns:
            roe = (
                dfr[["日期", "净资产收益率(%)"]]
                .dropna()
                .astype({"净资产收益率(%)": float})
            )
            # 只取 12-31 年报值，凑成「近 5 个年度 ROE」——年化口径可比且不被季度季节性干扰
            monthly = roe["日期"].astype(str).str.slice(0, 10)
            annual = roe[monthly.str.endswith("-12-31")]
            vals = sorted(annual["净资产收益率(%)"].tolist())
            if vals:
                cur = float(annual["净资产收益率(%)"].iloc[-1])
                below = sum(1 for x in vals if x < cur)
                metrics["roe"] = {
                    "current": round(cur, 2),
                    "percentile": round(below / max(len(vals) - 1, 1) * 100, 1),
                    "min": round(vals[0], 2), "max": round(vals[-1], 2),
                    "p20": round(_q(vals, 0.2), 2), "p50": round(_q(vals, 0.5), 2), "p80": round(_q(vals, 0.8), 2),
                    "n": len(vals),
                }
    except Exception:
        pass

    return {"period": "近5年", "metrics": metrics}


def full_valuation(code: str) -> dict:
    """单票完整估值：腾讯行情 + 一致预期 EPS + 前向PE/PEG/消化年数。"""
    quotes = tencent_quote([code])
    q = quotes.get(code)
    if not q:
        raise ValueError(f"未取到 {code} 的行情")

    price = q["price"]
    out = {
        "name": q["name"], "code": code, "price": price,
        "mcap_yi": q["mcap_yi"], "pe_ttm": q["pe_ttm"], "pb": q["pb"],
        "eps_26e": None, "eps_27e": None, "pe_26e": None,
        "cagr_pct": None, "peg": None, "digest_years": None, "analyst_count": 0,
    }

    try:
        rows = profit_forecast(code)
    except DependencyMissing:
        out["forecast_note"] = "一致预期需安装 akshare"
        return out

    def _eps(row: dict):
        # 同花顺对覆盖不全的股票会缺「均值」或给 '-' 占位，硬取会让整只票的估值接口 502
        try:
            return float(str(row.get("均值", "")).replace(",", ""))
        except ValueError:
            return None

    eps_26 = eps_27 = None
    for row in rows:
        y = str(row.get("年度", ""))
        if "2026" in y:
            eps_26 = _eps(row)
            try:
                out["analyst_count"] = int(float(row.get("预测机构数") or 0))
            except (TypeError, ValueError):
                pass
        elif "2027" in y:
            eps_27 = _eps(row)

    out["eps_26e"], out["eps_27e"] = eps_26, eps_27
    if eps_26 and eps_26 > 0:
        pe_26e = price / eps_26
        out["pe_26e"] = round(pe_26e, 1)
        if eps_27:
            cagr = eps_27 / eps_26 - 1
            out["cagr_pct"] = round(cagr * 100, 0)
            peg = calc_peg(pe_26e, cagr)
            out["peg"] = round(peg, 2) if peg != float("inf") else None
            dig = pe_digestion(pe_26e, cagr)
            out["digest_years"] = round(dig, 1) if dig != float("inf") else None
    return out


# ===========================================================================
# Layer 3/4/10 · 资金面 / 筹码 / 信号（东财数据中心，移植自 a-stock-data v3.3）
#
# 合规：以下端点全部按【用户传入的单个代码】返回该股的客观公开数据（龙虎榜记录、
# 融资融券、大宗交易、股东户数、分红、资金流、解禁、板块归属、投资者问答），
# 不预置标的、不做主观评分、不给买卖建议。
# 定位调整（2026-07-05）：涨停池 / 全市场成交额榜等【客观公开榜单】现已用于产品 UI
# （每日复盘的连板股 + 成交额 TOP20）——如实展示公开榜单≠荐股，只要不附推荐/评分/预测。
# 仍不做：主观评分排名、买卖点位、涨跌预测；龙虎榜个股名单/强势股/人气榜等带隐性倾向的甩单暂不进 UI。
# ===========================================================================

_DATACENTER_URL = "https://datacenter-web.eastmoney.com/api/data/v1/get"
_EM_MIN_INTERVAL = 1.0          # 两次东财请求最小间隔（秒），内置防封节流
_em_last_call = [0.0]
_EM_SESSIONS: dict = {}         # {direct(bool): requests.Session}

# 数据层连接模式：国内财经站（东财/腾讯/新浪）本应「直连」——很多用户开着 Clash/V2Ray
# 科学上网，系统代理会把东财这类国内站路由挂掉（典型：push2.eastmoney.com 的 CONNECT 被掐）。
# 默认 auto：先试直连、失败再降级走系统代理；探测一次后固定，避免每次都重试。
# 只有少数「必须靠代理才能出网」的环境需要 VR_DATA_PROXY=1 强制走代理。
# 注意：这只影响数据层；AI 层（可能要调国外模型）仍走各自的系统代理，不受影响。
_em_mode = ["proxy" if os.environ.get("VR_DATA_PROXY", "").strip().lower() in ("1", "true", "yes") else "auto"]


def _em_session(direct: bool):
    """东财专用会话。direct=True → `trust_env=False` 忽略 HTTP(S)_PROXY 环境变量、直连。

    直连会话不重试（探测要快，失败即降级）；代理会话保留瞬态错误退避重试。惰性构建、复用。
    """
    if direct in _EM_SESSIONS:
        return _EM_SESSIONS[direct]
    import requests

    s = requests.Session()
    s.headers.update({"User-Agent": UA})
    s.trust_env = not direct     # 直连会话不读环境里的代理配置
    try:
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry

        retry = Retry(total=0) if direct else Retry(
            total=3, connect=3, backoff_factor=0.6,
            status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET"])
        adapter = HTTPAdapter(max_retries=retry)
        s.mount("https://", adapter)
        s.mount("http://", adapter)
    except Exception:
        pass  # 老版本 urllib3 缺参数时降级为无重试
    _EM_SESSIONS[direct] = s
    return s


def em_get(url: str, params: dict | None = None, headers: dict | None = None, timeout: int = 15):
    """东财统一请求入口：串行限流 + **直连优先、失败降级系统代理**（避免科学上网代理挂掉国内站）。

    第一次请求探测：先直连（短超时、不重试），成功即固定走直连；失败则降级走系统代理并固定。
    探测结果整个进程复用，避免每次重试。`VR_DATA_PROXY=1` 可跳过探测、强制走代理。
    """
    wait = _EM_MIN_INTERVAL - (time.time() - _em_last_call[0])
    if wait > 0:
        time.sleep(wait + random.uniform(0.1, 0.5))
    try:
        mode = _em_mode[0]
        if mode != "auto":
            return _em_session(mode == "direct").get(url, params=params, headers=headers, timeout=timeout)
        # auto：先直连，成功固定 direct；直连失败再走系统代理、成功固定 proxy。
        try:
            r = _em_session(True).get(url, params=params, headers=headers, timeout=min(timeout, 8))
            _em_mode[0] = "direct"
            return r
        except Exception:
            r = _em_session(False).get(url, params=params, headers=headers, timeout=timeout)
            _em_mode[0] = "proxy"
            return r
    finally:
        _em_last_call[0] = time.time()


# ---------------------------------------------------------------------------
# 打板层 · 涨停/炸板/跌停/昨涨停 原始池（东财 push2ex，走 em_get 限流）
# ⚠️ 合规：原始池含个股 code/name —— 仅供 market.py 聚合成【不含个股名】的短线情绪指标。
#    切勿把原始池直接接成 API/UI（会甩个股名单、破产品「零标的」红线）。
# ---------------------------------------------------------------------------
_ZTB_UT = "7eea3edcaed734bea9cbfc24409ed989"


def em_zt_topic_pool(endpoint: str, date: str, sort: str = "fbt:asc") -> list[dict]:
    """东财涨停板行情中心原始池（push2ex）。
    endpoint: getTopicZTPool(涨停) / getTopicZBPool(炸板) / getTopicDTPool(跌停) / getYesterdayZTPool(昨涨停)
    date: YYYYMMDD 交易日。非交易日 / 参数错 → []。
    池内每项字段含 lbc(连板数) / zbc(炸板次数) / hybk(行业) 等。"""
    url = f"https://push2ex.eastmoney.com/{endpoint}"
    params = {"ut": _ZTB_UT, "dpt": "wz.ztzt", "Pageindex": 0,
              "pagesize": 10000, "sort": sort, "date": date}
    headers = {"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"}
    try:
        r = em_get(url, params=params, headers=headers, timeout=10)
        return (r.json().get("data") or {}).get("pool") or []
    except Exception:
        return []


def _numf(v):
    """东财数值字段可能是 '-'（停牌/无数据）→ 归一成 float 或 None。"""
    return v if isinstance(v, (int, float)) else None


def market_turnover_rank(n: int = 20) -> list[dict]:
    """全市场成交额榜（沪深京 A 股按成交额降序 TopN）。

    东财行情中心 clist。**push2(实时) 不可达时降级 push2delay(延迟行情，日榜场景足够)**。
    返回每只: code / name / price / pct / amount(成交额,元) / mcap(总市值,元) /
    float_cap(流通市值,元) / industry。
    ⚠️ 这是客观公开榜单数据（东财/同花顺同款），产品侧只做客观展示——非推荐、非预测、不评分。
    """
    params = {"pn": 1, "pz": n, "po": 1, "np": 1, "fltt": 2, "invt": 2, "fid": "f6",
              "fs": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
              "fields": "f12,f14,f2,f3,f6,f20,f21,f100"}
    diff: list[dict] = []
    for host in ("push2.eastmoney.com", "push2delay.eastmoney.com"):
        try:
            r = em_get(f"https://{host}/api/qt/clist/get", params=params,
                       headers={"User-Agent": UA}, timeout=12)
            diff = (r.json().get("data") or {}).get("diff") or []
            if diff:
                break
        except Exception:
            continue
    return [{
        "code": str(d.get("f12", "")), "name": d.get("f14", ""),
        "price": _numf(d.get("f2")), "pct": _numf(d.get("f3")),
        "amount": _numf(d.get("f6")), "mcap": _numf(d.get("f20")),
        "float_cap": _numf(d.get("f21")), "industry": d.get("f100", "") or "",
    } for d in diff]


def ths_hot_list(period: str = "hour", limit: int = 20) -> list[dict]:
    """同花顺热榜（移植自 a-stock-data §10.2，10jqka dq 接口，零鉴权不封 IP）。

    period: hour=当日人气飙升榜单 / day=当日人气总榜。
    返回每只: rank / code / name / heat(人气值) / pct(涨跌幅) /
    rank_chg(排名变化) / concepts(概念标签) / tag(人气标签) / reason(题材解读标题)。
    ⚠️ 客观公开榜单（同花顺同款），产品侧只做展示——非推荐、非预测、非评分。
    """
    if period not in ("hour", "day"):
        period = "hour"
    qs = urllib.parse.urlencode({"stock_type": "a", "type": period, "list_type": "normal"})
    url = f"https://dq.10jqka.com.cn/fuyao/hot_list_data/out/hot_list/v1/stock?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except Exception:
        return []
    lst = (payload.get("data") or {}).get("stock_list") or []
    out = []
    for it in lst[:limit]:
        tag = it.get("tag") or {}
        out.append({
            "rank": it.get("order"),
            "code": it.get("code", ""),
            "name": it.get("name", ""),
            "heat": it.get("rate"),
            "pct": it.get("rise_and_fall"),
            "rank_chg": it.get("hot_rank_chg"),
            "concepts": (tag.get("concept_tag") or [])[:4],
            "tag": tag.get("popularity_tag", "") or "",
            "reason": it.get("analyse_title", "") or "",
        })
    return out


def eastmoney_datacenter(report_name: str, columns: str = "ALL", filter_str: str = "",
                         page_size: int = 50, sort_columns: str = "", sort_types: str = "-1") -> list[dict]:
    """东财数据中心统一查询 —— 龙虎榜/解禁/融资融券/大宗交易/股东户数/分红 共用（已内置限流）。"""
    params = {
        "reportName": report_name, "columns": columns, "filter": filter_str,
        "pageNumber": "1", "pageSize": str(page_size),
        "sortColumns": sort_columns, "sortTypes": sort_types, "source": "WEB", "client": "WEB",
    }
    try:
        d = em_get(_DATACENTER_URL, params=params, timeout=15).json()
    except Exception:
        return []
    if d.get("result") and d["result"].get("data"):
        return d["result"]["data"]
    return []


def margin_trading(code: str, page_size: int = 30) -> list[dict]:
    """融资融券明细（日级）：融资余额 / 融资买入 / 融券余额 / 两融合计。"""
    data = eastmoney_datacenter(
        "RPTA_WEB_RZRQ_GGMX", filter_str=f'(SCODE="{code}")',
        page_size=page_size, sort_columns="DATE", sort_types="-1")
    return [{
        "date": str(r.get("DATE", ""))[:10],
        "rzye": r.get("RZYE", 0), "rzmre": r.get("RZMRE", 0), "rzche": r.get("RZCHE", 0),
        "rqye": r.get("RQYE", 0), "rqmcl": r.get("RQMCL", 0),
        "rzrqye": r.get("RZRQYE", 0),
    } for r in data]


def block_trade(code: str, page_size: int = 20) -> list[dict]:
    """大宗交易：成交价 / 折溢价率 / 量 / 买卖方营业部。"""
    data = eastmoney_datacenter(
        "RPT_DATA_BLOCKTRADE", filter_str=f'(SECURITY_CODE="{code}")',
        page_size=page_size, sort_columns="TRADE_DATE", sort_types="-1")
    rows = []
    for r in data:
        close = r.get("CLOSE_PRICE") or 0
        deal = r.get("DEAL_PRICE") or 0
        rows.append({
            "date": str(r.get("TRADE_DATE", ""))[:10],
            "price": deal, "close": close,
            "premium_pct": round((deal / close - 1) * 100, 2) if close else 0,
            "vol": r.get("DEAL_VOLUME", 0), "amount": r.get("DEAL_AMT", 0),
            "buyer": r.get("BUYER_NAME", ""), "seller": r.get("SELLER_NAME", ""),
        })
    return rows


def holder_num_change(code: str, page_size: int = 10) -> list[dict]:
    """股东户数变化（季度级）：户数 / 环比 / 户均持股。持续减少 = 筹码集中。"""
    data = eastmoney_datacenter(
        "RPT_HOLDERNUMLATEST", filter_str=f'(SECURITY_CODE="{code}")',
        page_size=page_size, sort_columns="END_DATE", sort_types="-1")
    return [{
        "date": str(r.get("END_DATE", ""))[:10],
        "holder_num": r.get("HOLDER_NUM", 0),
        "change_ratio": r.get("HOLDER_NUM_RATIO", 0),
        "avg_shares": r.get("AVG_FREE_SHARES", 0),
    } for r in data]


def dividend_history(code: str, page_size: int = 20) -> list[dict]:
    """分红送转历史：每股派息（税前）/ 每10股转增 / 每10股送股 / 进度。"""
    data = eastmoney_datacenter(
        "RPT_SHAREBONUS_DET", filter_str=f'(SECURITY_CODE="{code}")',
        page_size=page_size, sort_columns="EX_DIVIDEND_DATE", sort_types="-1")
    return [{
        "date": str(r.get("EX_DIVIDEND_DATE", ""))[:10],
        "bonus_rmb": r.get("PRETAX_BONUS_RMB", 0),
        "transfer_ratio": r.get("TRANSFER_RATIO", 0),
        "bonus_ratio": r.get("BONUS_RATIO", 0),
        "plan": r.get("ASSIGN_PROGRESS", ""),
    } for r in data]


def stock_fund_flow_120d(code: str) -> list[dict]:
    """个股资金流（日级，最近 120 交易日）：主力 / 小单 / 中单 / 大单 / 超大单净流入（元）。"""
    market_code = 1 if code.startswith("6") else 0
    params = {
        "secid": f"{market_code}.{code}",
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65",
        "lmt": "120",
    }
    headers = {"User-Agent": UA, "Referer": "https://quote.eastmoney.com/", "Origin": "https://quote.eastmoney.com"}
    try:
        d = em_get("https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get",
                   params=params, headers=headers, timeout=15).json()
    except Exception:
        return []
    rows = []
    for line in d.get("data", {}).get("klines", []):
        p = line.split(",")
        if len(p) >= 6:
            def _f(x):
                try:
                    return float(x) if x not in ("-", "") else 0.0
                except ValueError:
                    return 0.0
            rows.append({
                "date": p[0], "main_net": _f(p[1]), "small_net": _f(p[2]),
                "mid_net": _f(p[3]), "large_net": _f(p[4]), "super_net": _f(p[5]),
            })
    return rows


def dragon_tiger_board(code: str, trade_date: str | None = None, look_back: int = 30) -> dict:
    """龙虎榜：该股近期上榜记录 + 最近一次买卖席位 TOP5 + 机构专用席位净买。"""
    trade_date = trade_date or datetime.now().strftime("%Y-%m-%d")
    start = (datetime.strptime(trade_date, "%Y-%m-%d") - timedelta(days=look_back)).strftime("%Y-%m-%d")
    records = []
    data = eastmoney_datacenter(
        "RPT_DAILYBILLBOARD_DETAILSNEW",
        filter_str=f'(TRADE_DATE>=\'{start}\')(TRADE_DATE<=\'{trade_date}\')(SECURITY_CODE="{code}")',
        page_size=50, sort_columns="TRADE_DATE", sort_types="-1")
    for r in data:
        records.append({
            "date": str(r.get("TRADE_DATE", ""))[:10],
            "reason": r.get("EXPLANATION", ""),
            "net_buy": round((r.get("BILLBOARD_NET_AMT") or 0) / 10000, 1),  # 万元
            "turnover": round(float(r.get("TURNOVERRATE") or 0), 2),
        })

    seats = {"buy": [], "sell": []}
    institution = {"buy_amt": 0.0, "sell_amt": 0.0, "net_amt": 0.0}
    if records:
        latest = records[0]["date"]
        buy_data = eastmoney_datacenter(
            "RPT_BILLBOARD_DAILYDETAILSBUY",
            filter_str=f'(TRADE_DATE=\'{latest}\')(SECURITY_CODE="{code}")',
            page_size=10, sort_columns="BUY", sort_types="-1")
        sell_data = eastmoney_datacenter(
            "RPT_BILLBOARD_DAILYDETAILSSELL",
            filter_str=f'(TRADE_DATE=\'{latest}\')(SECURITY_CODE="{code}")',
            page_size=10, sort_columns="SELL", sort_types="-1")
        for r in buy_data[:5]:
            seats["buy"].append({"name": r.get("OPERATEDEPT_NAME", ""),
                                 "buy_amt": round((r.get("BUY") or 0) / 10000, 1),
                                 "sell_amt": round((r.get("SELL") or 0) / 10000, 1),
                                 "net": round((r.get("NET") or 0) / 10000, 1)})
        for r in sell_data[:5]:
            seats["sell"].append({"name": r.get("OPERATEDEPT_NAME", ""),
                                  "buy_amt": round((r.get("BUY") or 0) / 10000, 1),
                                  "sell_amt": round((r.get("SELL") or 0) / 10000, 1),
                                  "net": round((r.get("NET") or 0) / 10000, 1)})
        for detail, side in ((buy_data, "buy"), (sell_data, "sell")):
            for r in detail:
                if str(r.get("OPERATEDEPT_CODE", "")) == "0":  # 机构专用席位
                    amt = (r.get("BUY") or 0) if side == "buy" else (r.get("SELL") or 0)
                    institution[f"{side}_amt"] += amt
        institution["buy_amt"] = round(institution["buy_amt"] / 10000, 1)
        institution["sell_amt"] = round(institution["sell_amt"] / 10000, 1)
        institution["net_amt"] = round(institution["buy_amt"] - institution["sell_amt"], 1)
    return {"records": records, "seats": seats, "institution": institution}


def lockup_expiry(code: str, trade_date: str | None = None, forward_days: int = 90) -> dict:
    """限售解禁日历：历史解禁记录 + 未来 N 天待解禁事件。

    字段随东财 2026 改列名同步（a-stock-data §3.6）：旧 LIMITED_STOCK_TYPE/FREE_SHARES_NUM
    已废、致 type/shares 恒空 → 改 FREE_SHARES_TYPE/FREE_SHARES，并补 able_shares（实际可流通股数）。
    """
    trade_date = trade_date or datetime.now().strftime("%Y-%m-%d")
    history = [{
        "date": str(r.get("FREE_DATE", ""))[:10], "type": r.get("FREE_SHARES_TYPE", ""),
        "shares": r.get("FREE_SHARES", 0), "able_shares": r.get("ABLE_FREE_SHARES", 0),
        "ratio": r.get("FREE_RATIO", 0),
    } for r in eastmoney_datacenter(
        "RPT_LIFT_STAGE", filter_str=f'(SECURITY_CODE="{code}")',
        page_size=15, sort_columns="FREE_DATE", sort_types="-1")]

    end = (datetime.strptime(trade_date, "%Y-%m-%d") + timedelta(days=forward_days)).strftime("%Y-%m-%d")
    upcoming = [{
        "date": str(r.get("FREE_DATE", ""))[:10], "type": r.get("FREE_SHARES_TYPE", ""),
        "shares": r.get("FREE_SHARES", 0), "able_shares": r.get("ABLE_FREE_SHARES", 0),
        "ratio": r.get("FREE_RATIO", 0),
    } for r in eastmoney_datacenter(
        "RPT_LIFT_STAGE",
        filter_str=f'(SECURITY_CODE="{code}")(FREE_DATE>=\'{trade_date}\')(FREE_DATE<=\'{end}\')',
        page_size=20, sort_columns="FREE_DATE", sort_types="1")]
    return {"history": history, "upcoming": upcoming}


def concept_blocks(code: str) -> dict:
    """个股所属板块/概念归属（东财 slist，行业/概念/地域混合，板块名自解释）。"""
    market_code = 1 if code.startswith("6") else 0
    params = {"fltt": "2", "invt": "2", "secid": f"{market_code}.{code}",
              "spt": "3", "pi": "0", "pz": "200", "po": "1", "fields": "f12,f14,f3,f128"}
    headers = {"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"}
    try:
        d = em_get("https://push2.eastmoney.com/api/qt/slist/get", params=params, headers=headers, timeout=15).json()
    except Exception:
        return {"total": 0, "boards": [], "concept_tags": []}
    diff = (d.get("data") or {}).get("diff") or {}
    items = diff.values() if isinstance(diff, dict) else diff
    boards = [{"name": it.get("f14", ""), "code": it.get("f12", ""),
               "change_pct": it.get("f3", ""), "lead_stock": it.get("f128", "")} for it in items]
    return {"total": len(boards), "boards": boards, "concept_tags": [b["name"] for b in boards]}


def hot_concepts(code: str) -> list[dict]:
    """个股当下被市场归到哪些概念在炒（东财热门概念命中，按热度降序）。"""
    import requests

    try:
        prefix = "SH" if code.startswith("6") else "SZ"
        r = requests.post(
            "https://emappdata.eastmoney.com/stockrank/getHotStockRankList",
            json={"appId": "appId01", "globalId": "786e4c21-70dc-435a-93bb-38", "srcSecurityCode": prefix + code},
            headers={"User-Agent": UA}, timeout=10)
        data = r.json().get("data") or []
    except Exception:
        return []
    return [{"concept": x.get("conceptName"), "bk": x.get("conceptId"), "hit": x.get("hitCount")} for x in data]


def investor_qa(code: str, page_size: int = 30) -> list[dict]:
    """互动易问答（巨潮）：投资者提问 + 公司回复（answer=None 表示未回复）。"""
    import requests

    try:
        r1 = requests.post("https://irm.cninfo.com.cn/newircs/index/queryKeyboardInfo",
                           data={"keyWord": code}, headers={"User-Agent": UA}, timeout=10)
        d1 = r1.json().get("data") or []
        if not d1:
            return []
        org_id = d1[0].get("secid")
        params = {"_t": 1, "stockcode": code, "orgId": org_id, "pageSize": page_size,
                  "pageNum": 1, "keyWord": "", "startDay": "", "endDay": ""}
        rows = requests.post("https://irm.cninfo.com.cn/newircs/company/question",
                             params=params, headers={"User-Agent": UA}, timeout=10).json().get("rows") or []
    except Exception:
        return []
    out = []
    for it in rows:
        ts = it.get("pubDate")
        out.append({
            "company": it.get("companyShortName"),
            "question": it.get("mainContent"), "answer": it.get("attachedContent"),
            "answerer": it.get("attachedAuthor"),
            "ask_time": datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M") if ts else "",
        })
    return out


def industry_comparison(top_n: int = 20) -> dict:
    """全行业涨跌幅排名（东财行业板块，~100 个行业）：板块级涨跌 / 涨跌家数 / 领涨。"""
    params = {"pn": "1", "pz": "100", "po": "1", "np": "1", "fltt": "2", "invt": "2",
              "fid": "f3",  # fid=f3 + po=1：按涨跌幅降序，否则 top/bottom 切片非涨幅序（a-stock-data §3.7）
              "fs": "m:90+t:2", "fields": "f2,f3,f4,f12,f13,f14,f104,f105,f128,f136,f140,f141,f207"}
    try:
        d = em_get("https://push2.eastmoney.com/api/qt/clist/get",
                   params=params, headers={"User-Agent": UA}, timeout=15).json()
    except Exception:
        return {"top": [], "bottom": [], "total": 0}
    items = d.get("data", {}).get("diff", [])
    if isinstance(items, dict):
        items = list(items.values())
    if not items:
        return {"top": [], "bottom": [], "total": 0}
    rows = [{
        "rank": i + 1, "name": it.get("f14", ""), "change_pct": it.get("f3", 0),
        "code": it.get("f12", ""), "up_count": it.get("f104", 0), "down_count": it.get("f105", 0),
    } for i, it in enumerate(items)]
    return {"top": rows[:top_n], "bottom": rows[-top_n:], "total": len(rows)}
