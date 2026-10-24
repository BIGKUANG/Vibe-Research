import { useEffect, useRef, useState } from "react";
import { Columns3, Download, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IndexColumnDef, IndexColumnKey } from "@/lib/index-screener";

interface Props {
  count: number;
  quoteDate: string | null;
  etfSizeDate: string | null;
  noQuote: number;
  etfSizeMissing: number;
  asOf: string | null;
  stale: boolean;
  refreshing: boolean;
  columns: IndexColumnDef[];
  hidden: Set<IndexColumnKey>;
  onToggleColumn: (key: IndexColumnKey) => void;
  onExport: () => void;
  onRefresh: () => void;
}

function fmtAsOf(asOf: string | null): string {
  if (!asOf) return "—";
  const d = new Date(asOf);
  return Number.isNaN(d.getTime()) ? asOf : d.toLocaleString("zh-CN", { hour12: false });
}

export function IndexScreenerToolbar({
  count, quoteDate, etfSizeDate, noQuote, etfSizeMissing, asOf, stale, refreshing,
  columns, hidden, onToggleColumn, onExport, onRefresh,
}: Props) {
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colsOpen) return;
    const onDocDown = (e: MouseEvent) => {
      if (colsRef.current && !colsRef.current.contains(e.target as Node)) setColsOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [colsOpen]);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="text-sm font-medium text-foreground">命中 {count.toLocaleString("zh-CN")} 条</span>
        <span className={cn("font-mono text-muted-foreground", stale && "text-warning")}>行情日 {quoteDate || "—"}</span>
        <span className="font-mono text-muted-foreground">ETF规模 {etfSizeDate || "—"}</span>
        {noQuote > 0 && <span className="text-muted-foreground">无行情 {noQuote.toLocaleString("zh-CN")} 条</span>}
        {etfSizeMissing > 0 && <span className="text-muted-foreground">规模缺失 {etfSizeMissing} 只</span>}
        <span className="font-mono text-muted-foreground/60">抓取 {fmtAsOf(asOf)}</span>
        {stale && <span className="text-warning">数据可能已过期，后台刷新中</span>}
      </div>

      <div className="flex items-center gap-1.5">
        <div ref={colsRef} className="relative">
          <button type="button" onClick={() => setColsOpen((v) => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground">
            <Columns3 className="h-3.5 w-3.5" /> 列设置
          </button>
          {colsOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-lg border border-border bg-card p-1.5 shadow-xl">
              {columns.filter((c) => c.key !== "name").map((c) => {
                const visible = !hidden.has(c.key);
                return (
                  <button key={c.key} type="button" onClick={() => onToggleColumn(c.key)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50">
                    <span className={cn("flex h-3.5 w-3.5 items-center justify-center rounded border", visible ? "border-primary bg-primary/20" : "border-border")}>
                      {visible && <span className="h-1.5 w-1.5 rounded-sm bg-primary" />}
                    </span>
                    {c.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" onClick={onExport}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary/15 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/25">
          <Download className="h-3.5 w-3.5" /> 导出 CSV
        </button>
        <button type="button" onClick={onRefresh} disabled={refreshing} title="刷新指数行情"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border/60 px-3 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground disabled:opacity-50">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> 刷新
        </button>
      </div>
    </div>
  );
}
