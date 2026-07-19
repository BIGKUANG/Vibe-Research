import { useState, useEffect, useRef } from "react";
import { STOCK_CODES } from "@/data/stock_codes";
import { api } from "@/lib/api";

export interface Suggestion {
  code: string;
  name: string;
  mcap: number; // 市值（亿），0 表示未知
}

function searchLocal(q: string) {
  if (!q.trim()) return [];
  // 纯数字 → code 前缀匹配
  if (/^\d+$/.test(q)) {
    return STOCK_CODES.filter((s) => s.code.startsWith(q));
  }
  // 中文/其他 → name 包含匹配
  return STOCK_CODES.filter((s) => s.name.includes(q));
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
    const local = searchLocal(q);
    if (local.length === 0) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    // Phase 1: 先按 code 升序占位展示
    const initial: Suggestion[] = local.slice(0, 20).map((s) => ({
      code: s.code,
      name: s.name,
      mcap: 0,
    }));
    setSuggestions(initial);
    setLoading(true);

    // Phase 2: 防抖后调用 /api/quote 获市值，按市值降序重排
    const rid = ++runIdRef.current;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const codes = local
          .slice(0, 20)
          .map((s) => s.code)
          .join(",");
        const quotes = await api.quote(codes);
        if (rid !== runIdRef.current) return;
        const enriched: Suggestion[] = local.slice(0, 20).map((s) => ({
          code: s.code,
          name: s.name,
          mcap: quotes[s.code]?.mcap_yi ?? 0,
        }));
        enriched.sort((a, b) => b.mcap - a.mcap);
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
