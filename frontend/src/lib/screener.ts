// 股票筛选 · 纯逻辑（解码 / 条件 / 过滤 / 排序 / 列定义 / 格式化 / 导出）。
// 有意与 React 解耦：便于单测，组件只做渲染与状态编排。
// 合规：本模块只处理客观行情/估值/行业字段，不含评分、评级或买卖建议。

import type { ScreenerSnapshot } from "./api";

/** 全市场快照中的一行（已解码为对象，便于过滤/排序/展示）。 */
export interface ScreenerRow {
  code: string;
  name: string;
  price: number;
  change_pct: number;
  turnover_pct: number;
  vol_ratio: number;
  amplitude_pct: number;
  pe_ttm: number;
  pb: number;
  mcap_yi: number;
  float_mcap_yi: number;
  amount_wan: number;
  limit_up: number;
  limit_down: number;
  security_type: string;
  is_stale: boolean;
  industry: string;
  area: string;
  board: string;
  list_date: string;
  /** ROE 为按需增强（L2），未加载时为 undefined。 */
  roe?: number | null;
}

type RawValue = string | number | boolean | null;

/** 列式快照 → 行对象数组。按 fields 名称解码，后端字段顺序变化也不受影响。 */
export function decodeSnapshot(snap: ScreenerSnapshot): ScreenerRow[] {
  const idx = new Map<string, number>();
  snap.fields.forEach((f, i) => idx.set(f, i));
  const get = (r: RawValue[], k: string): RawValue | undefined => {
    const i = idx.get(k);
    return i == null ? undefined : r[i];
  };
  const str = (v: RawValue | undefined) => (v == null ? "" : String(v));
  const num = (v: RawValue | undefined) => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : 0;
  };
  return snap.rows.map((r) => ({
    code: str(get(r, "code")),
    name: str(get(r, "name")),
    price: num(get(r, "price")),
    change_pct: num(get(r, "change_pct")),
    turnover_pct: num(get(r, "turnover_pct")),
    vol_ratio: num(get(r, "vol_ratio")),
    amplitude_pct: num(get(r, "amplitude_pct")),
    pe_ttm: num(get(r, "pe_ttm")),
    pb: num(get(r, "pb")),
    mcap_yi: num(get(r, "mcap_yi")),
    float_mcap_yi: num(get(r, "float_mcap_yi")),
    amount_wan: num(get(r, "amount_wan")),
    limit_up: num(get(r, "limit_up")),
    limit_down: num(get(r, "limit_down")),
    security_type: str(get(r, "security_type")),
    is_stale: Boolean(get(r, "is_stale")),
    industry: str(get(r, "industry")),
    area: str(get(r, "area")),
    board: str(get(r, "board")),
    list_date: str(get(r, "list_date")),
    roe: undefined,
  }));
}

// ---------------------------------------------------------------------------
// 筛选条件
// ---------------------------------------------------------------------------

export interface RangeCond {
  min: string;
  max: string;
}

export interface ScreenerConditions {
  /** L0 板块（主板/中小板/创业板/科创板/北交所）；默认只勾选主板。 */
  boards: string[];
  /** L0 行业；空 = 全部。 */
  industries: string[];
  excludeSt: boolean;
  excludeStale: boolean;
  onlyPositivePe: boolean;
  pe: RangeCond;
  pb: RangeCond;
  roe: RangeCond;
  mcap: RangeCond;
  change: RangeCond;
  turnover: RangeCond;
  volRatio: RangeCond;
  amount: RangeCond;
  amplitude: RangeCond;
}

export const BOARD_OPTIONS = ["主板", "中小板", "创业板", "科创板", "北交所"] as const;

const emptyRange = (): RangeCond => ({ min: "", max: "" });

export function defaultConditions(): ScreenerConditions {
  return {
    boards: ["主板"],
    industries: [],
    excludeSt: true,
    excludeStale: true,
    onlyPositivePe: false,
    pe: emptyRange(),
    pb: emptyRange(),
    roe: emptyRange(),
    mcap: emptyRange(),
    change: emptyRange(),
    turnover: emptyRange(),
    volRatio: emptyRange(),
    amount: emptyRange(),
    amplitude: emptyRange(),
  };
}

type RangeKey =
  | "pe" | "pb" | "roe" | "mcap" | "change" | "turnover" | "volRatio" | "amount" | "amplitude";

const RANGE_KEYS: RangeKey[] = [
  "pe", "pb", "roe", "mcap", "change", "turnover", "volRatio", "amount", "amplitude",
];

/** 已设置的条件项数（用于头部「已选 N 项」；默认开关不计入）。 */
export function activeConditionCount(c: ScreenerConditions): number {
  let n = 0;
  if (c.boards.length) n += 1;
  if (c.industries.length) n += 1;
  if (c.onlyPositivePe) n += 1;
  for (const k of RANGE_KEYS) {
    if (c[k].min !== "" || c[k].max !== "") n += 1;
  }
  return n;
}

const RANGE_LABEL: Record<RangeKey, string> = {
  pe: "PE(TTM)", pb: "PB", roe: "ROE", mcap: "总市值(亿)", change: "涨跌幅(%)",
  turnover: "换手率(%)", volRatio: "量比", amount: "成交额(万)", amplitude: "振幅(%)",
};

/** 收起态展示用的条件摘要 chips。 */
export function conditionChips(c: ScreenerConditions): string[] {
  const chips: string[] = [];
  if (c.boards.length) chips.push(c.boards.join(" "));
  if (c.industries.length) chips.push(`行业:${c.industries.join("/")}`);
  if (c.onlyPositivePe) chips.push("仅正 PE");
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

function inBounds(v: number | undefined | null, b: NumBounds): boolean {
  if (b.min == null && b.max == null) return true;
  if (v == null || !Number.isFinite(v)) return false;
  if (b.min != null && v < b.min) return false;
  if (b.max != null && v > b.max) return false;
  return true;
}

const ST_RE = /ST|退/i;

/** 按条件过滤全量行。纯函数，无副作用。 */
export function filterRows(rows: ScreenerRow[], c: ScreenerConditions): ScreenerRow[] {
  const bounds = {
    pe: parseBounds(c.pe), pb: parseBounds(c.pb), roe: parseBounds(c.roe),
    mcap: parseBounds(c.mcap), change: parseBounds(c.change), turnover: parseBounds(c.turnover),
    volRatio: parseBounds(c.volRatio), amount: parseBounds(c.amount), amplitude: parseBounds(c.amplitude),
  };
  const boards = c.boards.length ? new Set(c.boards) : null;
  const industries = c.industries.length ? new Set(c.industries) : null;
  return rows.filter((r) => {
    if (boards && !boards.has(r.board)) return false;
    if (industries && !industries.has(r.industry)) return false;
    if (c.excludeSt && ST_RE.test(r.name)) return false;
    if (c.excludeStale && r.is_stale) return false;
    if (c.onlyPositivePe && !(r.pe_ttm > 0)) return false;
    return (
      inBounds(r.pe_ttm, bounds.pe) &&
      inBounds(r.pb, bounds.pb) &&
      inBounds(r.roe, bounds.roe) &&
      inBounds(r.mcap_yi, bounds.mcap) &&
      inBounds(r.change_pct, bounds.change) &&
      inBounds(r.turnover_pct, bounds.turnover) &&
      inBounds(r.vol_ratio, bounds.volRatio) &&
      inBounds(r.amount_wan, bounds.amount) &&
      inBounds(r.amplitude_pct, bounds.amplitude)
    );
  });
}

export type ColumnKey =
  | "name" | "price" | "change_pct" | "turnover_pct" | "vol_ratio" | "amplitude_pct"
  | "pe_ttm" | "pb" | "roe" | "mcap_yi" | "float_mcap_yi" | "amount_wan"
  | "industry" | "area" | "board" | "list_date";

export type SortDir = "asc" | "desc";

function sortValue(r: ScreenerRow, key: ColumnKey): string | number {
  if (key === "name") return r.name || r.code;
  const v = r[key];
  if (v == null || !Number.isFinite(v as number)) return Number.NEGATIVE_INFINITY;
  return v as number;
}

/** 按列排序（字符串列按中文拼音，数值列按大小；缺失值沉底）。 */
export function sortRows(rows: ScreenerRow[], key: ColumnKey, dir: SortDir): ScreenerRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = sortValue(a, key);
    const bv = sortValue(b, key);
    if (typeof av === "string" || typeof bv === "string") {
      return sign * String(av).localeCompare(String(bv), "zh-Hans-CN");
    }
    return sign * (av - bv);
  });
}

// ---------------------------------------------------------------------------
// 列定义 / 格式化 / 导出
// ---------------------------------------------------------------------------

export interface ColumnDef {
  key: ColumnKey;
  label: string;
  align: "left" | "right";
  /** 默认隐藏（用户可在「列设置」里打开）。 */
  hidden?: boolean;
  /** 涨跌配色列。 */
  colored?: boolean;
}

export const SCREENER_COLUMNS: ColumnDef[] = [
  { key: "name", label: "名称/代码", align: "left" },
  { key: "price", label: "现价", align: "right" },
  { key: "change_pct", label: "涨跌%", align: "right", colored: true },
  { key: "turnover_pct", label: "换手%", align: "right" },
  { key: "vol_ratio", label: "量比", align: "right" },
  { key: "amplitude_pct", label: "振幅%", align: "right" },
  { key: "pe_ttm", label: "PE(TTM)", align: "right" },
  { key: "pb", label: "PB", align: "right" },
  { key: "roe", label: "ROE%", align: "right" },
  { key: "mcap_yi", label: "总市值", align: "right" },
  { key: "float_mcap_yi", label: "流通市值", align: "right", hidden: true },
  { key: "amount_wan", label: "成交额", align: "right" },
  { key: "industry", label: "行业", align: "left" },
  { key: "area", label: "地区", align: "left", hidden: true },
  { key: "board", label: "板块", align: "left" },
  { key: "list_date", label: "上市日", align: "left", hidden: true },
];

export const fmt2 = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(2);

export const fmtPct = (v: number | null | undefined): string =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** 市值：单位「亿元」，≥1 万亿折成「万亿」。 */
export const fmtMcap = (yi: number | null | undefined): string => {
  if (yi == null || !Number.isFinite(yi) || yi <= 0) return "—";
  return yi >= 10000 ? `${(yi / 10000).toFixed(2)}万亿` : `${yi.toFixed(0)}亿`;
};

/** 成交额：入参单位为「万元」。 */
export const fmtAmount = (wan: number | null | undefined): string => {
  if (wan == null || !Number.isFinite(wan) || wan <= 0) return "—";
  return wan >= 10000 ? `${(wan / 10000).toFixed(2)}亿` : `${wan.toFixed(0)}万`;
};

/** 单元格式展示值（表格与 CSV 共用，保证所见即所出）。 */
export function cellText(r: ScreenerRow, key: ColumnKey): string {
  switch (key) {
    case "name": return r.name || r.code;
    case "price": return fmt2(r.price);
    case "change_pct": return fmtPct(r.change_pct);
    case "turnover_pct": return fmt2(r.turnover_pct);
    case "vol_ratio": return fmt2(r.vol_ratio);
    case "amplitude_pct": return fmt2(r.amplitude_pct);
    case "pe_ttm": return r.pe_ttm > 0 ? fmt2(r.pe_ttm) : "—";
    case "pb": return r.pb > 0 ? fmt2(r.pb) : "—";
    case "roe": return r.roe == null ? "—" : fmt2(r.roe);
    case "mcap_yi": return fmtMcap(r.mcap_yi);
    case "float_mcap_yi": return fmtMcap(r.float_mcap_yi);
    case "amount_wan": return fmtAmount(r.amount_wan);
    case "industry": return r.industry || "—";
    case "area": return r.area || "—";
    case "board": return r.board || "—";
    case "list_date": return r.list_date || "—";
  }
}

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** 导出 CSV（带 BOM，Excel 打开中文不乱码）。列顺序与可见列一致。 */
export function toCsv(rows: ScreenerRow[], keys: ColumnKey[]): string {
  const head = keys.map((k) => csvCell(SCREENER_COLUMNS.find((c) => c.key === k)?.label ?? k)).join(",");
  const lines = rows.map((r) => keys.map((k) => csvCell(cellText(r, k))).join(","));
  return "\uFEFF" + [head, ...lines].join("\n");
}
