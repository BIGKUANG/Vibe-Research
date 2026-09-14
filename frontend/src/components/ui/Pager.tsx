import { cn } from "@/lib/utils";

export interface PagerProps {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}

// 通用分页器：上一页 / 下一页 + 页码窗口（首末页常驻，当前页前后 ±1，其余用省略号）。
// 仅 1 页时不渲染。筛选页与自选页共用，避免两处各写一套。
export function Pager({ page, totalPages, onPage }: PagerProps) {
  if (totalPages <= 1) return null;

  const nums: (number | "…")[] = [];
  const span = 1;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - page) <= span) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  const navBtn = "rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex items-center gap-1">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={navBtn}>
        上一页
      </button>
      {nums.map((n, i) =>
        n === "…" ? (
          <span key={`e${i}`} className="px-1 text-xs text-muted-foreground/50">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onPage(n)}
            className={cn(
              "rounded px-2.5 py-1 text-xs transition-colors",
              n === page ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {n}
          </button>
        ),
      )}
      <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} className={navBtn}>
        下一页
      </button>
    </div>
  );
}
