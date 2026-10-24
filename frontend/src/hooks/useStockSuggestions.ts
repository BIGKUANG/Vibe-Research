import { useState, useEffect, useRef } from "react";
import { STOCK_CODES } from "@/data/stock_codes";
import { searchEtfs, normalizeFundCode } from "@/lib/etf";
import { api } from "@/lib/api";

export type SuggestionKind = "stock" | "etf" | "global";

export interface Suggestion {
  code: string;
  name: string;
  mcap: number; // 市值（亿），0 表示未知
  kind: SuggestionKind;
  /** 次级说明：ETF 的跟踪指数/管理人，股票的市场。 */
  sub?: string;
}

const A_SHARE_MARKETS = new Set(["主板", "中小板", "创业板", "科创板", "北交所"]);

function searchStocks(q: string, limit: number) {
  if (!q.trim()) return [];
  const numeric = /^\d+$/.test(normalizeFundCode(q));
  const code = normalizeFundCode(q);
  const matched = numeric
    ? STOCK_CODES.filter((s) => s.code.startsWith(code))
    : STOCK_CODES.filter((s) => s.name.includes(q));
  return matched.slice(0, limit).map((s) => ({
    code: s.code,
    name: s.name,
    mcap: 0,
    kind: (A_SHARE_MARKETS.has(s.market) ? "stock" : "global") as SuggestionKind,
    sub: s.market,
  }));
}

function searchLocal(q: string, limit: number): Suggestion[] {
  if (!q.trim()) return [];
  const etfs: Suggestion[] = searchEtfs(q, Math.min(10, limit)).map((e) => ({
    code: e.code,
    name: e.name,
    mcap: 0,
    kind: "etf",
    sub: `跟踪 ${e.indexName || "—"} · ${e.mgrName || "—"}`,
  }));
  const stocks = searchStocks(q, limit);
  const seen = new Set<string>();
  return [...etfs, ...stocks].filter((s) => {
    if (seen.has(s.code)) return false;
    seen.add(s.code);
    return true;
  }).slice(0, Math.max(limit, 10));
}

export function useStockSuggestions(q: string): {
  suggestions: Suggestion[];
  loading: boolean;
} {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    const local = searchLocal(q, 20);
    if (local.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Phase 1: 先展示本地结果（ETF 与股票合并，带类型标签）
    setSuggestions(local.slice(0, 10));
    setLoading(true);

    // Phase 2: 防抖后调用 /api/quote 获市值，按市值降序重排
    const rid = ++runIdRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        // 只对 A 股补市值；ETF / 海外代码保持 0（不请求、不排序）
        const stockCodes = local.filter((s) => s.kind === "stock").map((s) => s.code);
        const quotes = stockCodes.length ? await api.quote(stockCodes.slice(0, 20).join(",")) : {};
        if (rid !== runIdRef.current) return;
        const enriched: Suggestion[] = local.map((s) => ({
          ...s,
          mcap: s.kind === "stock" ? (quotes[s.code]?.mcap_yi ?? 0) : 0,
        }));
        const qCode = normalizeFundCode(q);
        enriched.sort((a, b) => {
          const aExact = a.code === qCode ? -1 : 0;
          const bExact = b.code === qCode ? -1 : 0;
          if (aExact !== bExact) return aExact - bExact;
          return b.mcap - a.mcap;
        });
        setSuggestions(enriched.slice(0, 10));
      } catch {
        // 网络错误时保持 Phase 1 的占位结果
      } finally {
        if (rid === runIdRef.current) setLoading(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [q]);

  return { suggestions, loading };
}
