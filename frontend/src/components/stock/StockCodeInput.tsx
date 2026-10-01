import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Search, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStockSuggestions, type Suggestion } from "@/hooks/useStockSuggestions";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSearch: (code?: string) => void;
  loading: boolean;
  /** 占位文案，默认按个股页（A股/美股/港股/韩股）。 */
  placeholder?: string;
  /** 主按钮文案，默认「查询」；自选页传「添加」即可复用同一组件。 */
  actionLabel?: string;
  /** 输入框宽度等附加样式，默认 `w-80`。 */
  inputClassName?: string;
  /** 下拉建议宽度，默认 `w-96`；输入框拉满时传 `w-full`。 */
  dropdownClassName?: string;
  /** 是否渲染组件自带的主按钮，默认 true。持仓 / 清仓等自定义布局传 false，只保留「输入框 + 模糊下拉」。 */
  showAction?: boolean;
  /** 下拉宽度（px 数字或 CSS 长度字符串）；默认跟随输入容器宽度。 */
  dropdownWidth?: number | string;
}

const DEFAULT_PLACEHOLDER = "A 股 6 位代码，或美股/港股/韩股（AAPL / 00700 / 005930.KS）";

export function StockCodeInput({
  value,
  onChange,
  onSearch,
  loading,
  placeholder = DEFAULT_PLACEHOLDER,
  actionLabel = "查询",
  inputClassName = "w-80",
  dropdownClassName = "w-96",
  showAction = true,
  dropdownWidth,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 下拉用 portal 渲染到 body 并 fixed 定位：外层 .glass 的 backdrop-filter 会创建层叠上下文，
  // 卡片内的 z-50 仍会被后渲染的兄弟卡片盖住；portal + fixed 才能保证浮层永远在最外层。
  const [anchor, setAnchor] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);

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
    // 主动失焦：下拉项 onMouseDown 用 preventDefault 阻止了 blur，DOM 焦点会停留在输入框上，
    // 导致下次点击不再触发 onFocus、「focused」永远是 false、下拉提示不再出现。这里主动 blur 复位。
    inputRef.current?.blur();
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

  // 点击容器 / 下拉外部时关闭
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || dropdownRef.current?.contains(t)) return;
      setFocused(false);
      setHighlightIdx(-1);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const showDropdown = focused && suggestions.length > 0;

  // 计算下拉锚点（fixed 定位依据）。打开时测一次，滚动 / 缩放时跟随。
  const updateAnchor = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({ left: r.left, top: r.top, bottom: r.bottom, width: r.width });
  }, []);

  useEffect(() => {
    if (!showDropdown) { setAnchor(null); return; }
    updateAnchor();
    const onMove = () => updateAnchor();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [showDropdown, updateAnchor]);

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
          placeholder={placeholder}
          className={cn(
            "rounded-lg border border-border bg-black/20 px-3 py-2 text-sm outline-none focus:border-primary/50",
            inputClassName,
          )}
        />
        {showAction && (
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
            {actionLabel}
          </button>
        )}
      </div>

      {/* 下拉建议列表：portal 到 body + fixed 定位，保证在最外层（不受 .glass 层叠 / 卡片裁剪影响） */}
      {showDropdown && anchor && createPortal(
        (() => {
          const spaceBelow = window.innerHeight - anchor.bottom - 8;
          const openUp = spaceBelow < 160 && anchor.top > spaceBelow;
          const maxH = Math.max(120, Math.min(320, openUp ? anchor.top - 8 : spaceBelow));
          return (
            <div
              ref={dropdownRef}
              style={{
                position: "fixed",
                left: anchor.left,
                top: openUp ? anchor.top - maxH - 4 : anchor.bottom + 4,
                width: dropdownWidth ?? anchor.width,
                maxHeight: maxH,
                zIndex: 1000,
              }}
              className={cn("overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl", dropdownClassName)}
            >
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
          );
        })(),
        document.body,
      )}
    </div>
  );
}
