// ETF 筛选 · 纯逻辑（解码 / 条件 / 过滤 / 排序 / 列定义 / 格式化 / 导出）。
// 数据来源：tushare etf_basic + fund_basic + etf_share_size + fund_daily（盘后日频）。
// 合规：只处理客观行情、规模、费率、分类字段，不含评分、评级或买卖建议。

import type { EtfScreenerSnapshot } from "./api";

/** 快照中的一行（已解码为对象）。缺失值为 null，不用 0 冒充。 */
export interface EtfScreenerRow {
  code: string;
  name: string;
  close: number | null;
  pct_chg: number | null;
  amount_yi: number | null;
  turnover_pct: number | null;
  size_yi: number | null;
  premium_pct: number | null;
  index_name: string;
  mgr_name: string;
  fund_type: string;
  is_qdii: boolean;
  mgt_fee: number | null;
  total_share: number | null;
  exchange: string;
  list_date: string;
  /** 有日线收盘价才算有报价（用于「排除无报价」）。 */
  has_quote: boolean;
}

type RawValue = string | number | boolean | null;

export function decodeEtfSnapshot(snap: EtfScreenerSnapshot): EtfScreenerRow[] {
  const idx = new Map<string, number>();
  snap.fields.forEach((f, i) => idx.set(f, i));
  const get = (r: RawValue[], k: string): RawValue | undefined => {
    const i = idx.get(k);
    return i == null ? undefined : r[i];
  };
  const str = (v: RawValue | undefined) => (v == null ? "" : String(v));
  const num = (v: RawValue | undefined): number | null => {
    if (v == null || v === "") return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return snap.rows.map((r) => {
    const close = num(get(r, "close"));
    return {
      code: str(get(r, "code")),
      name: str(get(r, "name")),
      close,
      pct_chg: num(get(r, "pct_chg")),
      amount_yi: num(get(r, "amount_yi")),
      turnover_pct: num(get(r, "turnover_pct")),
      size_yi: num(get(r, "size_yi")),
      premium_pct: num(get(r, "premium_pct")),
      index_name: str(get(r, "index_name")),
      mgr_name: str(get(r, "mgr_name")),
      fund_type: (() => {
        const t = str(get(r, "fund_type"));
        return (ETF_TYPES as readonly string[]).includes(t) ? t : "其他";
      })(),
      is_qdii: Boolean(get(r, "is_qdii")),
      mgt_fee: num(get(r, "mgt_fee")),
      total_share: num(get(r, "total_share")),
      exchange: str(get(r, "exchange")),
      list_date: str(get(r, "list_date")),
      has_quote: close != null,
    };
  });
}

// ---------------------------------------------------------------------------
// 条件
// ---------------------------------------------------------------------------

export interface RangeCond {
  min: string;
  max: string;
}

export const ETF_TYPES = ["股票型", "债券型", "货币型", "混合型", "其他"] as const;
export const EXCHANGE_OPTIONS = [
  { value: "SH", label: "沪市" },
  { value: "SZ", label: "深市" },
] as const;
export const NO_INDEX = "无跟踪指数";

export interface EtfConditions {
  exchanges: string[];
  types: string[];
  onlyQdii: boolean;
  indices: string[];
  managers: string[];
  size: RangeCond;
  fee: RangeCond;
  change: RangeCond;
  amount: RangeCond;
  turnover: RangeCond;
  premium: RangeCond;
  excludeNoQuote: boolean;
}

const emptyRange = (): RangeCond => ({ min: "", max: "" });

export function defaultEtfConditions(): EtfConditions {
  return {
    exchanges: ["SH", "SZ"],
    types: [...ETF_TYPES],
    onlyQdii: false,
    indices: [],
    managers: [],
    size: emptyRange(),
    fee: emptyRange(),
    change: emptyRange(),
    amount: emptyRange(),
    turnover: emptyRange(),
    premium: emptyRange(),
    excludeNoQuote: true,
  };
}

export function normalizeEtfConditions(raw: Partial<EtfConditions> | null | undefined): EtfConditions {
  const base = defaultEtfConditions();
  if (!raw) return base;
  const merged: EtfConditions = { ...base, ...raw };
  for (const k of ["size", "fee", "change", "amount", "turnover", "premium"] as const) {
    merged[k] = { ...base[k], ...(raw[k] ?? {}) };
  }
  merged.exchanges = Array.isArray(raw.exchanges) ? raw.exchanges : base.exchanges;
  merged.types = Array.isArray(raw.types) ? raw.types : base.types;
  merged.indices = Array.isArray(raw.indices) ? raw.indices : [];
  merged.managers = Array.isArray(raw.managers) ? raw.managers : [];
  return merged;
}

type RangeKey = "size" | "fee" | "change" | "amount" | "turnover" | "premium";

const RANGE_KEYS: RangeKey[] = ["size", "fee", "change", "amount", "turnover", "premium"];

const RANGE_LABEL: Record<RangeKey, string> = {
  size: "规模(亿)",
  fee: "费率(%)",
  change: "涨跌幅(%)",
  amount: "成交额(亿)",
  turnover: "换手率(%)",
  premium: "折溢价(%)",
};

export function etfActiveConditionCount(c: EtfConditions): number {
  let n = 0;
  if (c.exchanges.length !== EXCHANGE_OPTIONS.length) n += 1;
  if (c.types.length !== ETF_TYPES.length) n += 1;
  if (c.onlyQdii) n += 1;
  if (c.indices.length) n += 1;
  if (c.managers.length) n += 1;
  for (const k of RANGE_KEYS) {
    if (c[k].min !== "" || c[k].max !== "") n += 1;
  }
  return n;
}

/** 收起态摘要 chips。 */
export function etfConditionChips(c: EtfConditions): string[] {
  const chips: string[] = [];
  if (c.exchanges.length && c.exchanges.length !== EXCHANGE_OPTIONS.length) {
    chips.push(c.exchanges.map((e) => (e === "SH" ? "沪" : "深")).join(" "));
  }
  if (c.types.length && c.types.length !== ETF_TYPES.length) chips.push(`类型:${c.types.join("/")}`);
  if (c.onlyQdii) chips.push("仅跨境 QDII");
  if (c.indices.length) chips.push(`指数:${c.indices.join("/")}`);
  if (c.managers.length) chips.push(`管理人:${c.managers.join("/")}`);
  for (const k of RANGE_KEYS) {
    const { min, max } = c[k];
    if (min === "" && max === "") continue;
    chips.push(`${RANGE_LABEL[k]} ${min || "*"}–${max || "*"}`);
  }
  return chips;
}

// ---------------------------------------------------------------------------
// 过滤 / 排序
// ---------------------------------------------------------------------------

interface NumBounds { min: number | null; max: number | null }

function parseBounds(r: RangeCond): NumBounds {
  const toNum = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  return { min: toNum(r.min), max: toNum(r.max) };
}

function inBounds(v: number | null, b: NumBounds): boolean {
  if (b.min == null && b.max == null) return true;
  if (v == null) return false;
  if (b.min != null && v < b.min) return false;
  if (b.max != null && v > b.max) return false;
  return true;
}

export function filterEtfRows(rows: EtfScreenerRow[], c: EtfConditions): EtfScreenerRow[] {
  const exchanges = c.exchanges.length ? new Set(c.exchanges) : null;
  const types = c.types.length ? new Set(c.types) : null;
  const indices = c.indices.length ? new Set(c.indices) : null;
  const managers = c.managers.length ? new Set(c.managers) : null;
  const bounds = {
    size: parseBounds(c.size),
    fee: parseBounds(c.fee),
    change: parseBounds(c.change),
    amount: parseBounds(c.amount),
    turnover: parseBounds(c.turnover),
    premium: parseBounds(c.premium),
  };
  return rows.filter((r) => {
    if (exchanges && !exchanges.has(r.exchange)) return false;
    if (types && !types.has(r.fund_type)) return false;
    if (c.onlyQdii && !r.is_qdii) return false;
    if (indices && !indices.has(r.index_name || NO_INDEX)) return false;
    if (managers && !managers.has(r.mgr_name)) return false;
    if (c.excludeNoQuote && !r.has_quote) return false;
    return (
      inBounds(r.size_yi, bounds.size) &&
      inBounds(r.mgt_fee, bounds.fee) &&
      inBounds(r.pct_chg, bounds.change) &&
      inBounds(r.amount_yi, bounds.amount) &&
      inBounds(r.turnover_pct, bounds.turnover) &&
      inBounds(r.premium_pct, bounds.premium)
    );
  });
}

export type EtfColumnKey =
  | "name" | "close" | "pct_chg" | "amount_yi" | "turnover_pct" | "size_yi"
  | "premium_pct" | "index_name" | "mgr_name" | "fund_type" | "mgt_fee"
  | "list_date" | "total_share";

export type SortDir = "asc" | "desc";

function sortValue(r: EtfScreenerRow, key: EtfColumnKey): string | number | null {
  if (key === "name") return r.name || r.code;
  if (key === "index_name") return r.index_name || NO_INDEX;
  if (key === "mgr_name") return r.mgr_name;
  if (key === "fund_type") return r.fund_type;
  if (key === "list_date") return r.list_date;
  return r[key];
}

/** 按列排序；空值恒沉底（升序降序都一样），不被当成 0 参与比较。 */
export function sortEtfRows(rows: EtfScreenerRow[], key: EtfColumnKey, dir: SortDir): EtfScreenerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    const aNull = av == null || av === "";
    const bNull = bv == null || bv === "";
    if (aNull !== bNull) return aNull ? 1 : -1;
    if (aNull && bNull) return 0;
    if (typeof av === "string" || typeof bv === "string") {
      return sign * String(av).localeCompare(String(bv), "zh-Hans-CN");
    }
    return sign * (Number(av) - Number(bv));
  });
}

// ---------------------------------------------------------------------------
// 列定义 / 格式化 / 导出
// ---------------------------------------------------------------------------

export interface EtfColumnDef {
  key: EtfColumnKey;
  label: string;
  align: "left" | "right";
  hidden?: boolean;
  colored?: boolean;
}

export const ETF_COLUMNS: EtfColumnDef[] = [
  { key: "name", label: "代码/简称", align: "left" },
  { key: "close", label: "收盘价", align: "right" },
  { key: "pct_chg", label: "涨跌%", align: "right", colored: true },
  { key: "amount_yi", label: "成交额(亿)", align: "right" },
  { key: "turnover_pct", label: "换手%(T-1)", align: "right" },
  { key: "size_yi", label: "规模(亿)", align: "right" },
  { key: "premium_pct", label: "折溢价%(T-1)", align: "right" },
  { key: "index_name", label: "跟踪指数", align: "left" },
  { key: "mgr_name", label: "管理人", align: "left" },
  { key: "fund_type", label: "类型", align: "left" },
  { key: "mgt_fee", label: "费率%", align: "right" },
  { key: "list_date", label: "上市日", align: "left", hidden: true },
  { key: "total_share", label: "份额(万份)", align: "right", hidden: true },
];

const numFmt = (v: number | null, digits: number): string =>
  v == null ? "—" : v.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const fmtEtfPrice = (v: number | null): string => (v == null ? "—" : v.toFixed(3));

export const fmtEtfPct = (v: number | null, signed = false): string => {
  if (v == null) return "—";
  return `${signed && v > 0 ? "+" : ""}${v.toFixed(2)}%`;
};

const fmtDate = (s: string): string => {
  if (!s || s.length !== 8) return s || "—";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
};

/** 单元格式展示值（表格与 CSV 共用，保证所见即所出）。 */
export function etfCellText(r: EtfScreenerRow, key: EtfColumnKey): string {
  switch (key) {
    case "name": return `${r.code} ${r.name || ""}`.trim();
    case "close": return fmtEtfPrice(r.close);
    case "pct_chg": return fmtEtfPct(r.pct_chg, true);
    case "amount_yi": return numFmt(r.amount_yi, 2);
    case "turnover_pct": return fmtEtfPct(r.turnover_pct);
    case "size_yi": return numFmt(r.size_yi, 2);
    case "premium_pct": return fmtEtfPct(r.premium_pct, true);
    case "index_name": return r.index_name || "—";
    case "mgr_name": return r.mgr_name || "—";
    case "fund_type": return r.is_qdii ? `${r.fund_type}（跨境）` : r.fund_type;
    case "mgt_fee": return r.mgt_fee == null ? "—" : r.mgt_fee.toFixed(2);
    case "list_date": return fmtDate(r.list_date);
    case "total_share": return numFmt(r.total_share, 2);
  }
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出 CSV（带 BOM）。列顺序与可见列一致。 */
export function etfToCsv(rows: EtfScreenerRow[], keys: EtfColumnKey[]): string {
  const head = keys.map((k) => csvCell(ETF_COLUMNS.find((c) => c.key === k)?.label ?? k)).join(",");
  const lines = rows.map((r) => keys.map((k) => csvCell(etfCellText(r, k))).join(","));
  return "\uFEFF" + [head, ...lines].join("\n");
}

/** 从全量行提取下拉选项（按出现次数降序，空值归入「无跟踪指数」）。 */
export function etfOptions(rows: EtfScreenerRow[], key: "index_name" | "mgr_name"): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = key === "index_name" ? r.index_name || NO_INDEX : r.mgr_name;
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([k]) => k);
}
