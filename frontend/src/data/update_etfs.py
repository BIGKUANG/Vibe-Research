"""生成场内 ETF 代码表：etf_codes.csv + etf_codes.ts（同源，一次产出）。

用法：
    TUSHARE_TOKEN=xxxx python3 frontend/src/data/update_etfs.py
    python3 frontend/src/data/update_etfs.py --ts-only   # 仅从 CSV 重建 TS

数据源：tushare etf_basic（上市中）+ fund_basic（基金类型）。
token / 代理地址优先从项目根 .env 读取，其次环境变量。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "etf_codes.csv"
TS_PATH = HERE / "etf_codes.ts"
ROOT = HERE.parents[2]
ENV_PATH = ROOT / ".env"
DEFAULT_HTTP_URL = "https://tt.xiaodefa.cn"

CSV_FIELDS = [
    "code", "name", "exchange", "index_code", "index_name", "mgr_name",
    "fund_type", "is_qdii", "mgt_fee", "list_date", "status", "custodian",
]

TS_HEADER = """// Auto-generated from etf_codes.csv by update_etfs.py —— 请勿手改。
// 重新生成：`python3 frontend/src/data/update_etfs.py`（或 --ts-only 仅从 CSV 重建）
export interface EtfCode {
  code: string;
  name: string;
  exchange: string;
  indexCode: string;
  indexName: string;
  mgrName: string;
  fundType: string;
  isQdii: boolean;
  mgtFee: number | null;
  listDate: string;
  status: string;
  custodian: string;
}

export const ETF_UNIVERSE_AS_OF = "%s";

export const ETF_CODES: EtfCode[] = [
"""


def load_env() -> None:
    if not ENV_PATH.exists():
        return
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and v:
            # .env 优先于外部环境变量（与 update_stocks.py 的约定一致）
            os.environ[k] = v


def atomic_write(path: Path, text: str) -> None:
    fd, tmp = tempfile.mkstemp(dir=str(path.parent), prefix=path.name, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def fetch_rows() -> list[dict]:
    token = os.environ.get("TUSHARE_TOKEN", "").strip()
    if not token:
        raise SystemExit("缺少 TUSHARE_TOKEN（项目根 .env 或环境变量）")
    import tushare as ts

    pro = ts.pro_api(token)
    url = os.environ.get("TUSHARE_HTTP_URL", "").strip() or DEFAULT_HTTP_URL
    if url:
        pro._DataApi__http_url = url

    basic = pro.etf_basic(
        list_status="L",
        fields=(
            "ts_code,csname,extname,cname,index_code,index_name,setup_date,"
            "list_date,list_status,exchange,mgr_name,custod_name,mgt_fee,etf_type"
        ),
    )
    types: dict[str, str] = {}
    try:
        fb = pro.fund_basic(market="E", status="L", fields="ts_code,fund_type")
        for r in fb.to_dict("records"):
            if r.get("ts_code") and r.get("fund_type"):
                types[str(r["ts_code"])] = str(r["fund_type"])
    except Exception as e:  # noqa: BLE001 — 类型缺失不阻塞代码表
        print(f"[warn] fund_basic 获取失败，fund_type 用「其他」：{e}")

    def fnum(v):
        try:
            n = float(v)
            return n if n == n and abs(n) != float("inf") else None
        except (TypeError, ValueError):
            return None

    def sval(v) -> str:
        if v is None:
            return ""
        try:
            if isinstance(v, float) and (v != v or abs(v) == float("inf")):
                return ""
        except Exception:  # noqa: BLE001
            pass
        return str(v).strip()

    rows: list[dict] = []
    for r in basic.to_dict("records"):
        ts_code = sval(r.get("ts_code"))
        if not ts_code:
            continue
        code = ts_code.split(".")[0]
        ftype = types.get(ts_code) or "其他"
        rows.append({
            "code": code,
            "name": sval(r.get("extname")) or sval(r.get("csname")),
            "exchange": sval(r.get("exchange")),
            "index_code": sval(r.get("index_code")),
            "index_name": sval(r.get("index_name")),
            "mgr_name": sval(r.get("mgr_name")),
            "fund_type": ftype,
            "is_qdii": "1" if sval(r.get("etf_type")) == "QDII" else "0",
            "mgt_fee": "" if fnum(r.get("mgt_fee")) is None else fnum(r.get("mgt_fee")),
            "list_date": sval(r.get("list_date")),
            "status": sval(r.get("list_status")) or "L",
            "custodian": sval(r.get("custod_name")),
        })
    rows.sort(key=lambda x: x["code"])
    return rows


def write_csv(rows: list[dict]) -> None:
    import io

    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=CSV_FIELDS, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    atomic_write(CSV_PATH, buf.getvalue())


def read_csv() -> list[dict]:
    with CSV_PATH.open(encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def write_ts(rows: list[dict], as_of: str) -> None:
    items = []
    for r in rows:
        fee = r.get("mgt_fee")
        try:
            fee_val = float(fee) if str(fee).strip() != "" else None
        except ValueError:
            fee_val = None
        obj = {
            "code": r.get("code", ""),
            "name": r.get("name", ""),
            "exchange": r.get("exchange", ""),
            "indexCode": r.get("index_code", ""),
            "indexName": r.get("index_name", ""),
            "mgrName": r.get("mgr_name", ""),
            "fundType": r.get("fund_type", "") or "其他",
            "isQdii": r.get("is_qdii", "") == "1",
            "mgtFee": fee_val,
            "listDate": r.get("list_date", ""),
            "status": r.get("status", "L"),
            "custodian": r.get("custodian", ""),
        }
        items.append("  " + json.dumps(obj, ensure_ascii=False) + ",")
    text = TS_HEADER % as_of + "\n".join(items) + "\n];\n"
    atomic_write(TS_PATH, text)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ts-only", action="store_true", help="仅从现有 CSV 重建 TS")
    args = ap.parse_args()

    load_env()
    if args.ts_only:
        rows = read_csv()
        as_of = os.environ.get("ETF_UNIVERSE_AS_OF", "local")
    else:
        rows = fetch_rows()
        as_of = os.environ.get("ETF_UNIVERSE_AS_OF", "")
        write_csv(rows)
    if not as_of:
        import datetime
        as_of = datetime.date.today().isoformat()
    write_ts(rows, as_of)
    print(f"ETF 代码表已生成：{len(rows)} 只 → {CSV_PATH.name} / {TS_PATH.name}（as_of={as_of}）")


if __name__ == "__main__":
    main()
