import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, X, RefreshCw, Star, Columns3, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Pager } from "@/components/ui/Pager";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { StockCodeInput } from "@/components/stock/StockCodeInput";
import { loadWatch, saveWatch, addCodes } from "@/lib/watchlist";
import { useLiveQuotes, isTradingHours } from "@/hooks/useLiveQuotes";
import { fmt2, fmtPct, fmtMcap, fmtAmount } from "@/lib/screener";
import { STOCK_CODES } from "@/data/stock_codes";
import type { Quote } from "@/lib/api";
import { storageGet, storageSet } from "@/lib/storage";
import { cn } from "@/lib/utils";

// A 股红涨绿跌（与整个看板一致）。
const color = (v: number | undefined) =>
  v == null ? "text-muted-foreground" : v > 0 ? "text-danger" : v < 0 ? "text-success" : "text-muted-foreground";

const LIVE_KEY = "vr-watchlist-live";
const COLS_KEY = "vr-watchlist-columns";
// 分页：默认每页 25 条（与筛选结果表同一套分页器 Pager）。
const PAGE_SIZES = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 25;

// 列注册表（对齐筛选结果表的展示口径；数值列右侧统一 text-right + 等宽字体）。
type ColKey =
  | "name" | "price" | "change_pct" | "turnover_pct" | "vol_ratio" | "amplitude_pct"
  | "pe_ttm" | "pb" | "mcap_yi" | "float_mcap_yi" | "amount_wan" | "industry" | "board";

interface Col { key: ColKey; label: string; align: "left" | "right"; hidden?: boolean }

const COLUMNS: Col[] = [
  { key: "name", label: "名称/代码", align: "left" },
  { key: "price", label: "现价", align: "right" },
  { key: "change_pct", label: "涨跌%", align: "right" },
  { key: "turnover_pct", label: "换手%", align: "right" },
  { key: "vol_ratio", label: "量比", align: "right" },
  { key: "amplitude_pct", label: "振幅%", align: "right", hidden: true },
  { key: "pe_ttm", label: "PE(TTM)", align: "right" },
  { key: "pb", label: "PB", align: "right" },
  { key: "mcap_yi", label: "总市值", align: "right" },
  { key: "float_mcap_yi", label: "流通市值", align: "right", hidden: true },
  { key: "amount_wan", label: "成交额", align: "right", hidden: true },
  { key: "industry", label: "行业", align: "left" },
  { key: "board", label: "板块", align: "left", hidden: true },
];

const cell = (q: Quote | undefined, col: ColKey): string => {
  if (!q) return "—";
  switch (col) {
    case "price": return fmt2(q.price);
    case "change_pct": return fmtPct(q.change_pct);
    case "turnover_pct": return fmt2(q.turnover_pct);
    case "vol_ratio": return fmt2(q.vol_ratio);
    case "amplitude_pct": return fmt2(q.amplitude_pct);
    case "pe_ttm": return q.pe_ttm > 0 ? fmt2(q.pe_ttm) : "—";
    case "pb": return q.pb > 0 ? fmt2(q.pb) : "—";
    case "mcap_yi": return fmtMcap(q.mcap_yi);
    case "float_mcap_yi": return fmtMcap(q.float_mcap_yi);
    case "amount_wan": return fmtAmount(q.amount_wan);
    default: return "—";
  }
};

const sortVal = (q: Quote | undefined, col: ColKey): number | string => {
  if (!q) return Number.NEGATIVE_INFINITY;
  if (col === "name") return q.name || "";
  const v = q[col as keyof Quote];
  return typeof v === "number" && Number.isFinite(v) ? v : Number.NEGATIVE_INFINITY;
};

// localStorage 在隐私模式 / 嵌入式浏览器里可能直接抛异常（读写都兜底，避免白屏）。
const loadLive = (): boolean => storageGet(LIVE_KEY) === "on";

function loadHiddenCols(): Set<ColKey> {
  const raw = storageGet(COLS_KEY);
  if (raw) {
    try {
      const arr = JSON.parse(raw) as ColKey[];
      if (Array.isArray(arr)) return new Set(arr);
    } catch { /* 回退默认 */ }
  }
  return new Set(COLUMNS.filter((c) => c.hidden).map((c) => c.key));
}

// 列设置下拉（名称列常显不可隐藏）。
function ColumnSettings({ hidden, onToggle }: { hidden: Set<ColKey>; onToggle: (k: ColKey) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:text-foreground"
      >
        <Columns3 className="h-3.5 w-3.5" /> 列设置
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 w-40 rounded-lg border border-border bg-card p-1.5 shadow-xl">
          {COLUMNS.filter((c) => c.key !== "name").map((c) => {
            const visible = !hidden.has(c.key);
            return (
              <button
                key={c.key}
                onClick={() => onToggle(c.key)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
              >
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
  );
}

export function Watchlist() {
  const [codes, setCodes] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  // 实时行情默认**关闭**——开着会持续请求，让用户自己决定要不要开。
  const [live, setLive] = useState(loadLive);
  const [hidden, setHidden] = useState<Set<ColKey>>(loadHiddenCols);
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const { quotes, loading, updatedAt, polling, error, refresh } = useLiveQuotes(codes, live);

  const toggleLive = () => {
    setLive((on) => {
      const next = !on;
      storageSet(LIVE_KEY, next ? "on" : "off");
      return next;
    });
  };
  useEffect(() => { loadWatch().then((cs) => setCodes(cs)); }, []);
  // 自选增删后回到第 1 页（避免停在已不存在的页码）。
  useEffect(() => { setPage(1); }, [codes]);

  // 与「个股数据」页共用 StockCodeInput：输入代码或名称模糊搜索，选中/回车后得到 6 位代码，
  // 再复用 lib/watchlist.addCodes 去重入库（同一套解析 + 去重逻辑）。
  const add = (code?: string) => {
    const text = (code ?? input).trim();
    const { next, added } = addCodes(codes, text);
    if (added === 0) {
      setHint(text ? "没识别到新的 6 位代码（可能已在自选里）" : null);
      setInput("");
      return;
    }
    setCodes(next); saveWatch(next); setInput(""); setHint(`已添加 ${added} 只`);
  };
  const remove = (c: string) => {
    const next = codes.filter((x) => x !== c);
    setCodes(next); saveWatch(next);
  };

  const toggleColumn = (k: ColKey) => {
    if (k === "name") return;
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      storageSet(COLS_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  const onSort = (k: ColKey) => {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir("desc"); }
  };

  // 本批最新行情日期：只有报价日期落后于最新日期的才是真·停牌（避免盘前/收盘后误标）。
  const freshDate = useMemo(() => {
    let d = "";
    for (const c of codes) { const t = quotes[c]?.ts?.slice(0, 8); if (t && t > d) d = t; }
    return d;
  }, [codes, quotes]);

  const isStale = (q: Quote | undefined) =>
    Boolean(q?.is_stale && freshDate && q.ts?.slice(0, 8) !== freshDate);

  const meta = useMemo(() => {
    const m: Record<string, { industry: string; board: string }> = {};
    for (const s of STOCK_CODES) m[s.code] = { industry: s.industry, board: s.market };
    return m;
  }, []);

  const rows = useMemo(() => {
    const list = [...codes];
    if (sortKey) {
      const sign = sortDir === "asc" ? 1 : -1;
      list.sort((a, b) => {
        const av = sortVal(quotes[a], sortKey);
        const bv = sortVal(quotes[b], sortKey);
        if (typeof av === "string" || typeof bv === "string") {
          return sign * String(av).localeCompare(String(bv), "zh-Hans-CN");
        }
        return sign * (av - bv);
      });
    }
    return list;
  }, [codes, quotes, sortKey, sortDir]);

  const visible = useMemo(() => COLUMNS.filter((c) => !hidden.has(c.key)), [hidden]);

  // 分页（只影响展示；行情轮询与「让 AI 读自选」始终用完整 codes 列表）。
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize],
  );

  const aiContext = useMemo(
    () =>
      codes.length
        ? "我的自选股（本地）：\n" +
          codes
            .map((c) => {
              const q = quotes[c];
              return q
                ? `${q.name}(${c}) 现价${q.price} ${fmtPct(q.change_pct)} PE(TTM)${q.pe_ttm ?? "—"} PB${q.pb ?? "—"} 换手${q.turnover_pct ?? "—"}% 量比${q.vol_ratio ?? "—"} 总市值${fmtMcap(q.mcap_yi)} 行业${meta[c]?.industry ?? "—"}`
                : `${c}（行情未取到）`;
            })
            .join("\n")
        : "还没有自选股。",
    [codes, quotes, meta],
  );

  return (
    <div>
      <PageHeader
        title="自选股"
        subtitle="输入代码或名称模糊搜索添加，一屏总览你关注的标的。数据只存本地、不上传。"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLive}
              title={live ? "关闭实时行情" : "开启实时行情（交易时段每 3 秒自动刷新）"}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
                live
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative flex h-2 w-2">
                {polling && (
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
                )}
                <span
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    live ? "bg-primary" : "bg-muted-foreground/40",
                  )}
                />
              </span>
              实时行情
            </button>
            {codes.length > 0 && (
              <AskAiButton
                context={aiContext}
                label="让 AI 读自选"
                suggestions={["这几只里哪些估值偏高", "帮我按赛道分组看看", "各自最大的风险点是什么"]}
              />
            )}
          </div>
        }
      />

      {/* relative z-30：.glass 的 backdrop-filter 会形成层叠上下文，若不抬高本卡，
          下拉建议的 z-50 只在本卡内生效，会被下方后渲染的 [C] 玻璃卡盖住。 */}
      <GlassCard className="relative z-30 mb-4">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Plus className="h-4 w-4 text-primary" /> 添加自选
          </h3>
          <span className="text-[11px] text-muted-foreground/70">
            与「个股数据」同一输入框 · 支持代码 / 名称模糊搜索
          </span>
        </div>
        <StockCodeInput
          value={input}
          onChange={setInput}
          onSearch={add}
          loading={false}
          placeholder="输入代码或名称（如 600519 / 贵州茅台）"
          actionLabel="添加"
          inputClassName="flex-1 min-w-0"
          dropdownClassName="w-full"
        />
        {hint && <p className="mt-2 text-xs text-muted-foreground/70">{hint}</p>}
      </GlassCard>

      <GlassCard glow className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 px-4 py-2.5">
          <h3 className="flex items-center gap-1.5 font-semibold">
            <Star className="h-4 w-4 text-primary" /> 自选总览
            <span className="text-xs font-normal text-muted-foreground">（{codes.length}）</span>
          </h3>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground/70">
            {error ? (
              <span className="text-warning">{error}</span>
            ) : (
              <>
                {/* 把「开着却没在刷」的原因说清楚，否则用户会以为坏了 */}
                {live && !polling && codes.length > 0 && (
                  <span>{isTradingHours() ? "已暂停（页面未激活）" : "非交易时段 · 已暂停"}</span>
                )}
                {polling && <span className="text-primary/80">实时 · 每 3 秒</span>}
                {updatedAt && (
                  <span className="font-mono">
                    {new Date(updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
                  </span>
                )}
              </>
            )}
            <ColumnSettings hidden={hidden} onToggle={toggleColumn} />
            <button
              onClick={refresh}
              disabled={loading}
              className="text-muted-foreground hover:text-primary"
              title="立即刷新"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {codes.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground/60">
            还没有自选股，用上面的输入框搜索代码或名称添加。
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50 text-xs text-muted-foreground">
                  {visible.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => onSort(c.key)}
                      className={cn(
                        "sticky top-0 z-10 cursor-pointer select-none whitespace-nowrap bg-card/95 px-2.5 py-2 font-medium backdrop-blur transition-colors hover:text-foreground",
                        c.align === "right" ? "text-right" : "text-left",
                        sortKey === c.key && "text-primary",
                      )}
                    >
                      {c.label}
                      {sortKey === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
                    </th>
                  ))}
                  <th className="sticky top-0 z-10 bg-card/95 px-2.5 py-2 text-right font-medium backdrop-blur">操作</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((code) => {
                  const q = quotes[code];
                  const stale = isStale(q);
                  const nameCls = color(q?.change_pct);
                  return (
                    <tr key={code} className="border-b border-border/30 transition-colors hover:bg-muted/40">
                      {visible.map((c) => {
                        if (c.key === "name") {
                          return (
                            <td key={c.key} className="whitespace-nowrap px-2.5 py-2">
                              <Link to={`/stock-data?code=${code}`} className="font-medium hover:text-primary">
                                {q?.name || "—"}
                              </Link>
                              <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">{code}</span>
                              {stale && (
                                <span className="ml-1.5 rounded bg-warning/10 px-1.5 text-[10px] text-warning">停牌</span>
                              )}
                            </td>
                          );
                        }
                        if (c.key === "industry" || c.key === "board") {
                          const text = c.key === "industry" ? meta[code]?.industry : meta[code]?.board;
                          return (
                            <td key={c.key} className="whitespace-nowrap px-2.5 py-2 text-muted-foreground">
                              {text || "—"}
                            </td>
                          );
                        }
                        const v = cell(q, c.key);
                        const cls = c.align === "right" ? "text-right font-mono tabular-nums" : "";
                        const tone = c.key === "change_pct" || c.key === "price" ? nameCls : "text-muted-foreground";
                        return (
                          <td key={c.key} className={cn("whitespace-nowrap px-2.5 py-2", cls, tone)}>
                            {v}
                          </td>
                        );
                      })}
                      <td className="whitespace-nowrap px-2.5 py-2 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <Link
                            to={`/stock-data?code=${code}`}
                            title="查看个股数据"
                            className="text-muted-foreground/60 transition-colors hover:text-primary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                          <button
                            onClick={() => remove(code)}
                            title="移除"
                            className="text-muted-foreground/60 transition-colors hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* 分页条（参考筛选结果表）：默认每页 25 条，可切 25/50/100 */}
        {codes.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>共 {rows.length.toLocaleString("zh-CN")} 条</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-7 rounded-md border border-border bg-black/20 px-2 text-xs outline-none focus:border-primary/50"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s} className="bg-card">每页 {s}</option>)}
              </select>
            </div>
            <Pager page={safePage} totalPages={totalPages} onPage={setPage} />
          </div>
        )}
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
