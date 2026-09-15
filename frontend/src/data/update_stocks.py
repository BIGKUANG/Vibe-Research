"""生成全市场代码表：先写 stock_codes.csv，再由同一份数据生成 stock_codes.ts。

一次执行产出两个文件，保证前端打包用的 TS 与 CSV 完全同源、不会漂移。

用法：
    # 1) 从 tushare 拉取最新数据（需 token，写入 CSV + TS）
    TUSHARE_TOKEN=xxxx python3 frontend/src/data/update_stocks.py

    # 2) 仅用现有 CSV 重建 TS（不联网、不需要 token）——改了 CSV 或修复了 TS 时用
    python3 frontend/src/data/update_stocks.py --ts-only

环境变量 / 配置文件：
    配置优先从项目根目录 .env 读取，其次环境变量，最后内置默认：
        TUSHARE_TOKEN      tushare pro token（必需）
        TUSHARE_HTTP_URL   行情代理地址（默认 https://tt.xiaodefa.cn）
        TUSHARE_NO_PROXY   设为 1 时忽略系统/环境代理（本机代理不可用、但可直连时用）

说明：
    - TS 里 `market` 保留 CSV 原值（含「港股」「中小板」）；自选页「添加」只接受 6 位
      A 股代码，港股/其它市场的建议项仅用于个股数据页检索。
    - 写入采用「临时文件 + 原子替换」，避免中途失败留下半截文件。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import tempfile
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "stock_codes.csv"
TS_PATH = HERE / "stock_codes.ts"

# 项目根：<root>/frontend/src/data/update_stocks.py → parents[2] = <root>
ROOT = HERE.parents[2]
ENV_PATH = ROOT / ".env"

CSV_FIELDS = ["code", "name", "industry", "area", "market", "list_date"]

DEFAULT_HTTP_URL = "https://tt.xiaodefa.cn"

TS_HEADER = """// Auto-generated from stock_codes.csv by update_stocks.py —— 请勿手改。
// 重新生成：`python3 frontend/src/data/update_stocks.py`（或 --ts-only 仅从 CSV 重建）
export interface StockCode {
  code: string;
  name: string;
  industry: string;
  area: string;
  market: string;
  listDate: string;
}

export const STOCK_CODES: StockCode[] = [
"""


def market_of(ts_code: str) -> str:
    """tushare 的 ts_code（如 600519.SH / 300750.SZ / 920982.BJ）→ 板块标签。"""
    code, _, board = ts_code.partition(".")
    if board == "SH":
        return "科创板" if code.startswith("688") else "主板"
    if board == "SZ":
        if code.startswith(("300", "301")):
            return "创业板"
        if code.startswith("002"):
            return "中小板"
        return "主板"
    if board == "BJ":
        return "北交所"
    return "主板"


def _load_dotenv(path: Path) -> dict[str, str]:
    """极简 .env 解析：KEY=VALUE，跳过注释/空行，去掉首尾引号。不修改 os.environ。"""
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        if key:
            values[key] = val.strip().strip('"').strip("'")
    return values


def _config() -> dict[str, str]:
    """tushare 配置：优先根目录 .env，其次环境变量，最后内置默认。

    优先 .env 是为了避免 shell 里残留的过期配置（如已失效的 TUSHARE_HTTP_URL）覆盖项目配置。
    """
    dotenv = _load_dotenv(ENV_PATH)

    def pick(key: str, default: str = "") -> str:
        return dotenv.get(key, "").strip() or os.environ.get(key, "").strip() or default

    return {
        "token": pick("TUSHARE_TOKEN"),
        "http_url": pick("TUSHARE_HTTP_URL", DEFAULT_HTTP_URL),
        "no_proxy": pick("TUSHARE_NO_PROXY"),
    }


def _clean(value: object) -> str:
    """统一转字符串并去掉可能破坏 CSV/TS 的字符（逗号、换行）。"""
    text = "" if value is None else str(value).strip()
    return text.replace(",", " ").replace("\n", " ").replace("\r", " ")


def _disable_proxies() -> None:
    """让 requests 忽略环境变量与 macOS 系统代理。

    本机若配了一个不可用的本地代理（如 127.0.0.1:8118），requests 会强制走它导致
    ProxyError；此时设置 TUSHARE_NO_PROXY=1 直连即可。tushare 内部用 requests 的
    全局 Session，故直接关掉 Session 的 trust_env。
    """
    import requests

    original_init = requests.sessions.Session.__init__

    def init_without_proxy(self, *args, **kwargs):
        original_init(self, *args, **kwargs)
        self.trust_env = False

    requests.sessions.Session.__init__ = init_without_proxy


def fetch_rows() -> list[dict[str, str]]:
    """从 tushare 拉取 A 股 + 港股基础信息。"""
    cfg = _config()
    token = cfg["token"]
    if not token:
        sys.exit(f"缺少 tushare token：请在 {ENV_PATH} 设置 TUSHARE_TOKEN=... "
                 "（或导出同名环境变量）\n若只想用现有 CSV 重建 TS，请加 --ts-only，无需 token")

    if cfg["no_proxy"] not in ("", "0", "false", "False"):
        _disable_proxies()

    import tushare as ts  # 惰性导入：--ts-only 模式不需要该依赖

    pro = ts.pro_api(token)
    if cfg["http_url"]:
        # tushare 私有属性：指向自建/第三方代理地址
        pro._DataApi__http_url = cfg["http_url"]

    rows: list[dict[str, str]] = []

    a_df = pro.query(
        "stock_basic", exchange="", list_status="L",
        fields="ts_code,symbol,name,area,industry,list_date",
    )
    for r in a_df.itertuples(index=False):
        rows.append({
            "code": _clean(r.symbol),
            "name": _clean(r.name),
            "industry": _clean(r.industry),
            "area": _clean(r.area),
            "market": market_of(_clean(r.ts_code)),
            "list_date": _clean(r.list_date),
        })

    hk_df = pro.query("hk_basic", list_status="L")
    for r in hk_df.itertuples(index=False):
        rows.append({
            "code": _clean(str(r.ts_code).partition(".")[0]),
            "name": _clean(r.name),
            "industry": "",
            "area": "",
            "market": "港股",
            "list_date": _clean(getattr(r, "list_date", "")),
        })

    return rows


def read_csv_rows() -> list[dict[str, str]]:
    """读取现有 CSV（--ts-only 用）。"""
    if not CSV_PATH.exists():
        sys.exit(f"找不到 {CSV_PATH}，无法 --ts-only 重建 TS")
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        return [{k: _clean(v) for k, v in row.items()} for row in csv.DictReader(f)]


def normalize(rows: list[dict[str, str]]) -> list[dict[str, str]]:
    """去重（同代码保留首条）并按代码排序。"""
    unique: dict[str, dict[str, str]] = {}
    for row in rows:
        code = row.get("code", "")
        if not code:
            continue
        unique.setdefault(code, {k: _clean(row.get(k, "")) for k in CSV_FIELDS})
    return sorted(unique.values(), key=lambda r: r["code"])


def _atomic_write(path: Path, text: str) -> None:
    """临时文件 + 原子替换，避免写坏既有文件。"""
    fd, tmp_name = tempfile.mkstemp(dir=str(path.parent), prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp_name, path)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def write_csv(rows: list[dict[str, str]]) -> None:
    fd, tmp_name = tempfile.mkstemp(dir=str(CSV_PATH.parent), prefix=f".{CSV_PATH.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDS, lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)
        os.replace(tmp_name, CSV_PATH)
    except BaseException:
        Path(tmp_name).unlink(missing_ok=True)
        raise


def write_ts(rows: list[dict[str, str]]) -> None:
    """由同一份 rows 生成 stock_codes.ts（值用 JSON 转义，避免引号/反斜杠破坏语法）。"""
    lines = [
        "  {{ code: {code}, name: {name}, industry: {industry}, area: {area}, "
        "market: {market}, listDate: {list_date} }},".format(
            **{field: json.dumps(row.get(field, ""), ensure_ascii=False) for field in CSV_FIELDS}
        )
        for row in rows
    ]
    _atomic_write(TS_PATH, TS_HEADER + "\n".join(lines) + "\n];\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="生成 stock_codes.csv 与 stock_codes.ts")
    parser.add_argument(
        "--ts-only", action="store_true",
        help="不联网，仅用现有 CSV 重建 TS（不需要 TUSHARE_TOKEN）",
    )
    args = parser.parse_args()

    rows = normalize(read_csv_rows() if args.ts_only else fetch_rows())

    if not args.ts_only:
        write_csv(rows)
    write_ts(rows)

    counts = Counter(r["market"] for r in rows)
    detail = " / ".join(f"{m} {n}" for m, n in counts.most_common())
    print(f"完成：{len(rows)} 条 → {CSV_PATH.name}"
          f"{'（未改动）' if args.ts_only else ''} + {TS_PATH.name}")
    if not args.ts_only:
        print(f"数据源：{_config()['http_url']}（配置来自 {ENV_PATH}）")
    print(f"板块分布：{detail}")


if __name__ == "__main__":
    main()
