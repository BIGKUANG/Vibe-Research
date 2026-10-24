import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { etfCellText, type EtfColumnDef, type EtfColumnKey, type EtfScreenerRow, type SortDir } from "@/lib/etf-screener";

interface Props {
  rows: EtfScreenerRow[];
  columns: EtfColumnDef[];
  sortKey: EtfColumnKey;
  sortDir: SortDir;
  onSort: (key: EtfColumnKey) => void;
  onAddWatch: (code: string) => void;
  added: Set<string>;
  emptyHint: string;
}

function Cell({ row, col }: { row: EtfScreenerRow; col: EtfColumnDef }) {
  if (col.key === "name") {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className="font-mono text-xs text-muted-foreground">{row.code}</span>
        <Link to={`/etf-data?code=${row.code}`} className="ml-2 font-medium hover:text-primary">
          {row.name || "—"}
        </Link>
        {row.is_qdii && <span className="ml-1.5 rounded bg-muted/60 px-1.5 text-[10px] text-muted-foreground">跨境</span>}
      </td>
    );
  }
  const color = col.colored && row.pct_chg != null
    ? (row.pct_chg > 0 ? "text-danger" : row.pct_chg < 0 ? "text-success" : "text-muted-foreground")
    : col.align === "right" ? "text-muted-foreground" : "";
  return (
    <td className={cn("whitespace-nowrap px-3 py-2", col.align === "right" && "text-right font-mono tabular-nums", color)}>
      {etfCellText(row, col.key)}
    </td>
  );
}

export function EtfScreenerTable({
  rows, columns, sortKey, sortDir, onSort, onAddWatch, added, emptyHint,
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={() => onSort(c.key)}
                className={cn(
                  "sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-card/95 px-3 py-2 font-medium backdrop-blur transition-colors hover:text-foreground",
                  c.align === "right" && "text-right",
                  sortKey === c.key && "text-primary",
                )}
              >
                {c.label}
                {sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
            <th className="sticky top-0 z-10 bg-card/95 px-3 py-2 text-right font-medium backdrop-blur">操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length + 1} className="px-3 py-16 text-center text-sm text-muted-foreground/60">
                {emptyHint}
              </td>
            </tr>
          ) : (
            rows.map((r) => (
              <tr key={r.code} className="border-b border-border/30 transition-colors hover:bg-muted/40">
                {columns.map((c) => (
                  <Cell key={c.key} row={r} col={c} />
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => onAddWatch(r.code)}
                    title={added.has(r.code) ? "已在自选" : "加入自选"}
                    className={cn(
                      "rounded p-1 transition-colors",
                      added.has(r.code) ? "text-primary" : "text-muted-foreground hover:text-primary",
                    )}
                  >
                    <Star className={cn("h-3.5 w-3.5", added.has(r.code) && "fill-current")} />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
