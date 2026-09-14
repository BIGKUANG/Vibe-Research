import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  /** 下拉列表最大高度（px）。 */
  maxHeight?: number;
}

// 多选（可搜索）：已选项以 chip 展示，下拉内搜索 + 勾选。用于行业等多值条件。
export function MultiSelect({ options, value, onChange, placeholder = "全部", maxHeight = 220 }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim();
    return q ? options.filter((o) => o.includes(q)) : options;
  }, [options, query]);

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex min-h-8 w-full items-center gap-1.5 rounded-md border border-border bg-black/20 px-2 py-1 text-left text-sm transition-colors hover:border-primary/40",
          open && "border-primary/50",
        )}
      >
        <span className="flex flex-1 flex-wrap items-center gap-1">
          {value.length === 0 ? (
            <span className="px-0.5 text-muted-foreground/50">{placeholder}</span>
          ) : (
            value.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pl-2 pr-1 text-xs text-primary">
                {v}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(v);
                  }}
                />
              </span>
            ))
          )}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 w-full rounded-lg border border-border bg-card p-1.5 shadow-xl">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索…"
            className="mb-1 h-7 w-full rounded-md border border-border bg-black/20 px-2 text-xs outline-none focus:border-primary/50"
          />
          <div className="overflow-auto" style={{ maxHeight }}>
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground/60">无匹配项</p>
            ) : (
              filtered.map((opt) => {
                const checked = value.includes(opt);
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(opt)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      checked ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
                    )}
                  >
                    <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", checked ? "border-primary bg-primary/20" : "border-border")}>
                      {checked && <span className="h-1.5 w-1.5 rounded-sm bg-primary" />}
                    </span>
                    {opt}
                  </button>
                );
              })
            )}
          </div>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mt-1 w-full rounded-md border-t border-border/50 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              清空已选（{value.length}）
            </button>
          )}
        </div>
      )}
    </div>
  );
}
