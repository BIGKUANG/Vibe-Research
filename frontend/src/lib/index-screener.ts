// 指数筛选 · 纯逻辑（解码 / 条件 / 过滤 / 排序 / 列定义 / 格式化 / 导出）。
// 数据来源：tushare index_basic + index_daily/sw_daily + ETF 跟踪聚合。

import type { IndexScreenerSnapshot } from "./api";

export interface IndexRow {
  code: string;
  name: string;
  fullname: string;
  market: string;
  publisher: string;
  category: string;
  index_type: string;
  base_date: string;
  base_point: number | null;
  list_date: string;
  exp_date: string;
  close: number | null;
  pct_chg: number | null;
  etf_count: number;
  etf_size_yi: number | null;
  status: string;
}

type RawValue = string | number | boolean | null;

export function decodeIndexSnapshot(snap: IndexScreenerSnapshot): IndexRow[] {
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
  return snap.rows.map((r) => ({
    code: str(get(r, "code")),
    name: str(get(r, "name")),
    fullname: str(get(r, "fullname")),
    market: str(get(r, "market")),
    publisher: str(get(r, "publisher")),
    category: str(get(r, "category")),
    index_type: str(get(r, "index_type")),
    base_date: str(get(r, "base_date")),
    base_point: num(get(r, "base_point")),
    list_date: str(get(r, "list_date")),
    exp_date: str(get(r, "exp_date")),
    close: num(get(r, "close")),
    pct_chg: num(get(r, "pct_chg")),
    etf_count: num(get(r, "etf_count")) ?? 0,
    etf_size_yi: num(get(r, "etf_size_yi")),
    status: str(get(r, "status")) || "存续",
  }));
}

// ---------------------------------------------------------------------------
// 条件
// ---------------------------------------------------------------------------

export interface RangeCond { min: string; max: string }
export interface IndexConditions {
  markets: string[];
  categories: string[];
  publishers: string[];
  indexTypes: string[];
  listDate: RangeCond;
  onlyEtf: boolean;
  etfCount: RangeCond;
  etfSize: RangeCond;
  change: RangeCond;
  onlyQuote: boolean;
  statuses: string[];
  query: string;
}

export const INDEX_MARKETS = ["CSI", "CNI", "SW", "SSE", "SZSE", "BSE"] as const;
export const MARKET_LABEL: Record<string, string> = {
  CSI: "中证", CNI: "国证", SW: "申万", SSE: "沪市", SZSE: "深市", BSE: "北交所",
};
export const NO_TYPE = "未分类";

const emptyRange = (): RangeCond => ({ min: "", max: "" });

export function defaultIndexConditions(): IndexConditions {
  return {
    markets: [...INDEX_MARKETS],
    categories: [],
    publishers: [],
    indexTypes: [],
    listDate: emptyRange(),
    onlyEtf: false,
    etfCount: emptyRange(),
    etfSize: emptyRange(),
    change: emptyRange(),
    onlyQuote: false,
    statuses: ["存续", "终止"],
    query: "",
  };
}

export function normalizeIndexConditions(raw: Partial<IndexConditions> | null | undefined): IndexConditions {
  const base = defaultIndexConditions();
  if (!raw) return base;
  const merged: IndexConditions = { ...base, ...raw };
  for (const k of ["listDate", "etfCount", "etfSize", "change"] as const) {
    merged[k] = { ...base[k], ...(raw[k] ?? {}) };
  }
  merged.markets = Array.isArray(raw.markets) ? raw.markets : base.markets;
  merged.categories = Array.isArray(raw.categories) ? raw.categories : [];
  merged.publishers = Array.isArray(raw.publishers) ? raw.publishers : [];
  merged.indexTypes = Array.isArray(raw.indexTypes) ? raw.indexTypes : [];
  merged.statuses = Array.isArray(raw.statuses) ? raw.statuses : base.statuses;
  merged.query = typeof raw.query === "string" ? raw.query : "";
  return merged;
}

type RangeKey = "listDate" | "etfCount" | "etfSize" | "change";
const RANGE_KEYS: RangeKey[] = ["listDate", "etfCount", "etfSize", "change"];
const RANGE_LABEL: Record<RangeKey, string> = {
  listDate: "发布日", etfCount: "ETF数", etfSize: "ETF规模(亿)", change: "涨跌幅(%)",
};

export function indexActiveCount(c: IndexConditions): number {
  let n = 0;
  if (c.markets.length !== INDEX_MARKETS.length) n += 1;
  if (c.categories.length) n += 1;
  if (c.publishers.length) n += 1;
  if (c.indexTypes.length) n += 1;
  if (c.onlyEtf) n += 1;
  if (c.onlyQuote) n += 1;
  if (c.query.trim()) n += 1;
  if (c.statuses.length !== 2) n += 1;
  for (const k of RANGE_KEYS) if (c[k].min !== "" || c[k].max !== "") n += 1;
  return n;
}

export function indexConditionChips(c: IndexConditions): string[] {
  const chips: string[] = [];
  if (c.markets.length && c.markets.length !== INDEX_MARKETS.length) chips.push(c.markets.map((m) => MARKET_LABEL[m] ?? m).join(" "));
  if (c.categories.length) chips.push(`类别:${c.categories.join("/")}`);
  if (c.publishers.length) chips.push(`发布方:${c.publishers.join("/")}`);
  if (c.indexTypes.length) chips.push(`类型:${c.indexTypes.join("/")}`);
  if (c.onlyEtf) chips.push("仅看有 ETF");
  if (c.onlyQuote) chips.push("仅有行情");
  if (c.query.trim()) chips.push(`搜索:${c.query.trim()}`);
  if (c.statuses.length !== 2) chips.push(c.statuses.join("/"));
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
const normDate = (s: string) => s.replace(/-/g, "");

export function filterIndexRows(rows: IndexRow[], c: IndexConditions): IndexRow[] {
  const markets = c.markets.length ? new Set(c.markets) : null;
  const cats = c.categories.length ? new Set(c.categories) : null;
  const pubs = c.publishers.length ? new Set(c.publishers) : null;
  const types = c.indexTypes.length ? new Set(c.indexTypes) : null;
  const statuses = c.statuses.length ? new Set(c.statuses) : null;
  const q = c.query.trim().toLowerCase();
  const db = parseBounds(c.listDate);
  const cb = parseBounds(c.etfCount);
  const sb = parseBounds(c.etfSize);
  const chb = parseBounds(c.change);
  return rows.filter((r) => {
    if (markets && !markets.has(r.market)) return false;
    if (cats && !cats.has(r.category)) return false;
    if (pubs && !pubs.has(r.publisher)) return false;
    if (types && !types.has(r.index_type || NO_TYPE)) return false;
    if (statuses && !statuses.has(r.status)) return false;
    if (c.onlyEtf && !(r.etf_count > 0)) return false;
    if (c.onlyQuote && r.close == null) return false;
    if (q && !(r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q) || r.fullname.toLowerCase().includes(q))) return false;
    const ld = normDate(r.list_date);
    if (db.min != null && (!ld || ld < String(db.min))) return false;
    if (db.max != null && (!ld || ld > String(db.max))) return false;
    return (
      inBounds(r.etf_count, cb) &&
      inBounds(r.etf_size_yi, sb) &&
      inBounds(r.pct_chg, chb)
    );
  });
}

export type IndexColumnKey =
  | "name" | "market" | "category" | "publisher" | "close" | "pct_chg"
  | "list_date" | "etf_count" | "etf_size_yi" | "status";
export type SortDir = "asc" | "desc";

function sortValue(r: IndexRow, key: IndexColumnKey): string | number | null {
  if (key === "name") return r.name || r.code;
  if (key === "market") return MARKET_LABEL[r.market] ?? r.market;
  if (key === "category") return r.category;
  if (key === "publisher") return r.publisher;
  if (key === "list_date") return normDate(r.list_date);
  if (key === "status") return r.status;
  return r[key];
}

export function sortIndexRows(rows: IndexRow[], key: IndexColumnKey, dir: SortDir): IndexRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    const an = av == null || av === "";
    const bn = bv == null || bv === "";
    if (an !== bn) return an ? 1 : -1;
    if (an && bn) {
      // 默认规模并列时用发布日倒序，避免顺序随机
      return normDate(b.list_date).localeCompare(normDate(a.list_date));
    }
    if (typeof av === "string" || typeof bv === "string") {
      return sign * String(av).localeCompare(String(bv), "zh-Hans-CN");
    }
    return sign * (Number(av) - Number(bv));
  });
}

// ---------------------------------------------------------------------------
// 列定义 / 格式化 / 导出
// ---------------------------------------------------------------------------

export interface IndexColumnDef {
  key: IndexColumnKey;
  label: string;
  align: "left" | "right";
  hidden?: boolean;
  colored?: boolean;
}

export const INDEX_COLUMNS: IndexColumnDef[] = [
  { key: "name", label: "代码/名称", align: "left" },
  { key: "market", label: "市场", align: "left" },
  { key: "category", label: "类别", align: "left" },
  { key: "publisher", label: "发布方", align: "left" },
  { key: "close", label: "最新点位", align: "right" },
  { key: "pct_chg", label: "涨跌%", align: "right", colored: true },
  { key: "list_date", label: "发布日", align: "left" },
  { key: "etf_count", label: "ETF数", align: "right" },
  { key: "etf_size_yi", label: "规模(亿)", align: "right" },
  { key: "status", label: "状态", align: "left" },
];

const fmtDate = (s: string) => (s && s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : s || "—");
const fmtPct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`);
const fmtNum = (v: number | null, d = 2) => (v == null ? "—" : v.toLocaleString("zh-CN", { minimumFractionDigits: d, maximumFractionDigits: d }));

export function indexCellText(r: IndexRow, key: IndexColumnKey): string {
  switch (key) {
    case "name": return `${r.code} ${r.name}`.trim();
    case "market": return MARKET_LABEL[r.market] ?? r.market;
    case "category": return r.category || "—";
    case "publisher": return r.publisher || "—";
    case "close": return fmtNum(r.close, 2);
    case "pct_chg": return fmtPct(r.pct_chg);
    case "list_date": return fmtDate(r.list_date);
    case "etf_count": return String(r.etf_count);
    case "etf_size_yi": return r.etf_count === 0 ? "0.00" : fmtNum(r.etf_size_yi, 2);
    case "status": return r.status;
  }
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function indexToCsv(rows: IndexRow[], keys: IndexColumnKey[]): string {
  const head = keys.map((k) => csvCell(INDEX_COLUMNS.find((c) => c.key === k)?.label ?? k)).join(",");
  const lines = rows.map((r) => keys.map((k) => csvCell(indexCellText(r, k))).join(","));
  return "\uFEFF" + [head, ...lines].join("\n");
}

export function indexOptions(rows: IndexRow[], key: "category" | "publisher" | "index_type"): string[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = key === "index_type" ? (r.index_type || NO_TYPE) : r[key];
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([k]) => k);
}
