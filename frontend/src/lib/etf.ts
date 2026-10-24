// 本地 ETF 代码表查询（由 tushare etf_basic 离线生成，见 data/update_etfs.py）。
import { ETF_CODES, type EtfCode } from "@/data/etf_codes";

const ETF_MAP = new Map<string, EtfCode>();
for (const e of ETF_CODES) ETF_MAP.set(e.code, e);

/** 510300 / 510300.SH / sh510300 → 510300。 */
export function normalizeFundCode(raw: string): string {
  const s = (raw || "").trim().toUpperCase();
  if (s.endsWith(".SH") || s.endsWith(".SZ")) return s.slice(0, 6);
  if ((s.startsWith("SH") || s.startsWith("SZ")) && s.length === 8) return s.slice(2);
  return s;
}

export function findEtf(raw: string): EtfCode | undefined {
  const code = normalizeFundCode(raw);
  if (!/^\d{6}$/.test(code)) return undefined;
  return ETF_MAP.get(code);
}

export function isEtfCode(raw: string): boolean {
  return findEtf(raw) != null;
}

export function searchEtfs(q: string, limit = 10): EtfCode[] {
  const s = q.trim();
  if (!s) return [];
  if (/^\d+$/.test(normalizeFundCode(s))) {
    const code = normalizeFundCode(s);
    return ETF_CODES.filter((e) => e.code.startsWith(code)).slice(0, limit);
  }
  return ETF_CODES.filter((e) => e.name.includes(s) || e.indexName.includes(s)).slice(0, limit);
}

/** 本地静态档案（无 token 时也能展示；字段来自 etf_basic 快照）。 */
export function localEtfProfile(e: EtfCode) {
  return {
    code: e.code,
    ts_code: `${e.code}.${e.exchange || (e.code.startsWith("5") ? "SH" : "SZ")}`,
    name: e.name,
    full_name: "",
    exchange: e.exchange,
    index_code: e.indexCode,
    index_name: e.indexName,
    fund_type: e.fundType || "其他",
    etf_type: e.isQdii ? "QDII" : "境内",
    is_qdii: e.isQdii,
    mgr_name: e.mgrName,
    custodian: e.custodian,
    mgt_fee: e.mgtFee,
    setup_date: "",
    list_date: e.listDate,
    list_status: e.status || "L",
    source: "local",
    as_of: "",
  };
}
