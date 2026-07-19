import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStockSuggestions, type Suggestion } from "@/hooks/useStockSuggestions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSearch: (code?: string) => void;
  loading: boolean;
}

export function StockCodeInput({ value, onChange, onSearch, loading }: Props) {
  const [focused, setFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { suggestions, loading: suggestLoading } = useStockSuggestions(
    focused ? value : "",
  );

  // 关闭下拉（延迟，让点击事件先触发）
  const closeDropdown = () => {
    if (blurTimerRef.current) clearTimeout(blurTimerRef.current);
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
      setHighlightIdx(-1);
    }, 150);
  };

  // 选中条目
  const select = (s: Suggestion) => {
    onChange(s.code);
    setFocused(false);
    setHighlightIdx(-1);
    // 把 code 直接传给 onSearch，避免 closure 读到旧的 value
    onSearch(s.code);
  };

  // 键盘导航
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < suggestions.length) {
        select(suggestions[highlightIdx]);
      } else if (suggestions.length > 0) {
        // 有下拉建议但没有高亮时，自动选中第一条（输入"上海临港"后回车→自动转600848查询）
        select(suggestions[0]);
      } else {
        onSearch(value);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : 0,
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev > 0 ? prev - 1 : suggestions.length - 1,
      );
      return;
    }
    if (e.key === "Escape") {
      setFocused(false);
      setHighlightIdx(-1);
      inputRef.current?.blur();
    }
  };

  // 输入值变化时重置高亮
  useEffect(() => {
    setHighlightIdx(-1);
  }, [value]);

  // 点击容器外部时关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setFocused(false);
        setHighlightIdx(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = focused && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            // 只限制长度，不限制字符（让输入法自由输入，搜索函数处理匹配逻辑）
            onChange(e.target.value.slice(0, 12));
          }}
          onFocus={() => setFocused(true)}
          onBlur={closeDropdown}
          onKeyDown={handleKeyDown}
          placeholder="A 股 6 位代码，或美股/港股/韩股（AAPL / 00700 / 005930.KS）"
          className="w-80 rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50"
        />
        <button
          onClick={() => {
            // 有下拉建议时优先使用第一条，避免中文名称直接传给后端
            if (suggestions.length > 0) {
              select(suggestions[0]);
            } else {
              onSearch(value);
            }
          }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary/15 px-4 py-2 text-sm font-medium text-primary shadow-glow hover:bg-primary/25 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          查询
        </button>
      </div>

      {/* 下拉建议列表 */}
      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-1 w-96 rounded-lg border border-border bg-card p-1 shadow-xl">
          {suggestions.map((s, i) => (
            <button
              key={s.code}
              onMouseDown={(e) => {
                e.preventDefault(); // 阻止 blur 抢先
                select(s);
              }}
              onMouseEnter={() => setHighlightIdx(i)}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                i === highlightIdx ? "bg-primary/15 text-primary" : "hover:bg-muted/50",
              )}
            >
              <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">
                {s.code}
              </span>
              <span className="flex-1 truncate">{s.name}</span>
              {s.mcap > 0 ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {s.mcap >= 10000
                    ? `${(s.mcap / 10000).toFixed(2)} 万亿`
                    : `${s.mcap.toFixed(0)} 亿`}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground/40">
                  {suggestLoading ? "加载中…" : "—"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
