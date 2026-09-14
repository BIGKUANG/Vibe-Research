import { Star } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { cellText, type ColumnDef, type ColumnKey, type ScreenerRow, type SortDir } from "@/lib/screener";

interface Props {
  rows: ScreenerRow[];
  columns: ColumnDef[];
  sortKey: ColumnKey;
  sortDir: SortDir;
  onSort: (key: ColumnKey) => void;
  onAddWatch: (code: string) => void;
  added: Set<string>;
  roeLoading: boolean;
  emptyHint: string;
}

// 单列单元格（涨跌列按 A 股红涨绿跌着色；ROE 未加载时显示骨架条）。
function Cell({ row, col, roeLoading }: { row: ScreenerRow; col: ColumnDef; roeLoading: boolean }) {
  if (col.key === "name") {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <Link to={`/stock-data?code=${row.code}`} className="font-medium hover:text-primary">{row.name}</Link>
        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{row.code}</span>
        {row.is_stale && <span className="ml-1.5 rounded bg-warning/10 px-1 text-[10px] text-warning">停牌</span>}
      </td>
    );
  }
  if (col.key === "roe" && row.roe == null) {
    return (
      <td className="px-3 py-2 text-right">
        {roeLoading ? <span className="inline-block h-3 w-10 animate-pulse rounded bg-muted/60 align-middle" /> : <span className="text-muted-foreground/50">—</span>}
      </td>
    );
  }
  const text = cellText(row, col.key);
  const color = col.colored
    ? row.change_pct > 0 ? "text-danger" : row.change_pct < 0 ? "text-success" : "text-muted-foreground"
    : col.align === "right" ? "text-muted-foreground" : "";
  return (
    <td className={cn("whitespace-nowrap px-3 py-2", col.align === "right" && "text-right font-mono tabular-nums", color)}>
      {text}
    </td>
  );
}

export function ScreenerTable({ rows, columns, sortKey, sortDir, onSort, onAddWatch, added, roeLoading, emptyHint }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] border-collapse text-sm">
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
                  <Cell key={c.key} row={r} col={c} roeLoading={roeLoading} />
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <div className="inline-flex items-center gap-1 opacity-60 transition-opacity hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => onAddWatch(r.code)}
                      title={added.has(r.code) ? "已在自选" : "加入自选"}
                      className={cn("rounded p-1 transition-colors", added.has(r.code) ? "text-primary" : "text-muted-foreground hover:text-primary")}
                    >
                      <Star className={cn("h-3.5 w-3.5", added.has(r.code) && "fill-current")} />
                    </button>
                    <Link to={`/stock-data?code=${r.code}`} className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-primary">
                      查看
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
