import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  MARKET_LABEL, indexCellText,
  type IndexColumnDef, type IndexColumnKey, type IndexRow, type SortDir,
} from "@/lib/index-screener";

interface Props {
  rows: IndexRow[];
  columns: IndexColumnDef[];
  sortKey: IndexColumnKey;
  sortDir: SortDir;
  onSort: (key: IndexColumnKey) => void;
  emptyHint: string;
}

function Cell({ row, col }: { row: IndexRow; col: IndexColumnDef }) {
  if (col.key === "name") {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <button
          type="button"
          title={`${row.fullname || row.name}（点击复制代码）`}
          onClick={() => {
            navigator.clipboard?.writeText(row.code).then(
              () => toast.success(`已复制 ${row.code}`),
              () => toast.error("复制失败"),
            );
          }}
          className="text-left"
        >
          <span className="font-mono text-xs text-muted-foreground hover:text-primary">{row.code}</span>
          <span className="ml-2 font-medium hover:text-primary">{row.name || "—"}</span>
        </button>
      </td>
    );
  }
  const color = col.colored && row.pct_chg != null
    ? (row.pct_chg > 0 ? "text-danger" : row.pct_chg < 0 ? "text-success" : "text-muted-foreground")
    : col.align === "right" ? "text-muted-foreground" : "";
  if (col.key === "status") {
    return (
      <td className="whitespace-nowrap px-3 py-2">
        <span className={cn("rounded px-1.5 py-0.5 text-[10px]", row.status === "终止" ? "bg-warning/10 text-warning" : "bg-muted/60 text-muted-foreground")}>
          {row.status}
        </span>
      </td>
    );
  }
  return (
    <td className={cn("whitespace-nowrap px-3 py-2", col.align === "right" && "text-right font-mono tabular-nums", color)}>
      {col.key === "publisher"
        ? <span className="block max-w-[180px] truncate" title={row.publisher}>{indexCellText(row, col.key)}</span>
        : indexCellText(row, col.key)}
      {col.key === "market" && <span className="sr-only">{MARKET_LABEL[row.market] ?? row.market}</span>}
    </td>
  );
}

export function IndexScreenerTable({ rows, columns, sortKey, sortDir, onSort, emptyHint }: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1080px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border/50 text-left text-xs text-muted-foreground">
            {columns.map((c) => (
              <th key={c.key} onClick={() => onSort(c.key)}
                className={cn("sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-card/95 px-3 py-2 font-medium backdrop-blur transition-colors hover:text-foreground",
                  c.align === "right" && "text-right", sortKey === c.key && "text-primary")}>
                {c.label}
                {sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-16 text-center text-sm text-muted-foreground/60">{emptyHint}</td>
            </tr>
          ) : rows.map((r) => (
            <tr key={r.code} className="border-b border-border/30 transition-colors hover:bg-muted/40">
              {columns.map((c) => <Cell key={c.key} row={r} col={c} />)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
