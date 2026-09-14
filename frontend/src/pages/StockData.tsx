import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  FileText, Newspaper, AlertCircle, LineChart, BarChart3, Megaphone,
  Wallet, Trophy, CalendarClock, Boxes, MessageSquare, Download,
  ChevronLeft, ChevronRight, Building2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { EarningsSnapshot } from "@/components/ui/EarningsSnapshot";
import { Disclaimer } from "@/components/ui/Disclaimer";
import {
  api, ApiError, type Valuation, type Report, type NewsItem, type ValPercentile, type ValMetric,
  type Financials, type Announcement, type MarginRow, type BlockTradeRow, type HolderRow,
  type DividendRow, type FundFlowRow, type DragonTiger, type Lockup, type Blocks, type HotConcept, type QaRow,
  type GlobalStock, type HkCashflow, type CompanyInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { StockCodeInput } from "@/components/stock/StockCodeInput";
import { PriceDistribution } from "@/components/stock/PriceDistribution";
import { KLineChart } from "@/components/stock/KLineChart";

// 金额格式化（后端资金单位：元 / 万元）
const yi = (v: number) => `${(v / 1e8).toFixed(2)} 亿`;
// 市值（元）→ 万亿 / 亿
const money = (v: number) => (v >= 1e12 ? `${(v / 1e12).toFixed(2)} 万亿` : `${(v / 1e8).toFixed(2)} 亿`);

// 研报 / 公告 / 新闻 分页每页条数
const PAGE_SIZE = 15;

const fmt = (v: number | null | undefined, suffix = "") =>
  v === null || v === undefined ? "—" : `${v}${suffix}`;

// A股红涨绿跌（中国平台看美港股也用此惯例）
const pctColor = (p: number | null | undefined) =>
  p != null && p > 0 ? "text-danger" : p != null && p < 0 ? "text-success" : "text-muted-foreground";
const pctStr = (p: number | null | undefined) => (p == null ? "—" : `${p > 0 ? "+" : ""}${p}%`);
// 美/港股金额（原生币种）
const curOf = (market: string) => (market === "HK" ? "港元" : market === "KR" ? "韩元" : "美元");
const mktName = (m: string) => (m === "HK" ? "港股" : m === "KR" ? "韩股" : "美股");
const bigMoney = (v: number | null, market: string) =>
  v == null ? "—" : v >= 1e12 ? `${(v / 1e12).toFixed(2)} 万亿${curOf(market)}` : `${(v / 1e8).toFixed(0)} 亿${curOf(market)}`;
const round2 = (v: number | null | undefined, suffix = "") =>
  v == null ? "—" : `${Math.round(v * 100) / 100}${suffix}`;

// 百分比：后端偶发给 null/缺字段时显示 —，不出现 "NaN%" / 误导性 "0.00%"
const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(2)}%`;

// 小指标块（复用于资金面/筹码卡）
function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-muted/30 p-3">
      <p className="text-xs text-muted-foreground">{k}</p>
      <p className="mt-0.5 font-mono text-base font-bold">{v}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// 估值历史分位带（理杏仁式）：绿=低估区 / 灰=合理区 / 红=高估区；只给位置，不划买卖。
// 条形采用**百分位轴**（0~100 分位），游标按 percentile 放置，从而图像与百分比范围严格对应；
// 各刻度处标注该分位对应的数值（min/p20/p50/p80/max）。
// invert=true（ROE 等"值越大越低估"指标）：X 轴从大到小（左=高分位），游标镜像为 100-percentile，
//   绿段仍在左（对应高分位=低估），红段在右；刻度整体翻转。
// fmt 可选：数值格式化（如总市值 亿元→万亿/亿元），缺省原样显示。
function ValBand({ label, m, invert = false, fmt }:
  { label: string; m: ValMetric; invert?: boolean; fmt?: (v: number) => string }) {
  // 百分位轴：游标=percentile（invert 时镜像到左端即可达大值方向）
  const cur = Math.min(100, Math.max(0, m.percentile));
  const zoneColor = invert
    ? (cur > 80 ? "text-success" : cur < 20 ? "text-danger" : "text-muted-foreground")
    : (cur < 20 ? "text-success" : cur > 80 ? "text-danger" : "text-muted-foreground");
  const zoneLabel = invert
    ? (cur > 80 ? "低估区" : cur < 20 ? "高估区" : "合理区")
    : (cur < 20 ? "低估区" : cur > 80 ? "高估区" : "合理区");
  const show = fmt ?? ((v: number) => `${v}`);
  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1 text-sm">
        <span className="font-medium">{label} <span className="text-xs text-muted-foreground/60">{m.n} 点</span></span>
        <span className="text-muted-foreground">当前 <b className="font-mono text-foreground">{show(m.current)}</b> · 近5年 <b className={cn("font-mono", zoneColor)}>{m.percentile}%</b> 分位（<span className={zoneColor}>{zoneLabel}</span>）</span>
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-full">
        <div className="absolute inset-0 flex">
          <div className="bg-success/35" style={{ width: `20%` }} />
          <div className="bg-muted" style={{ width: `60%` }} />
          <div className="flex-1 bg-danger/35" />
        </div>
        <div className="absolute top-1/2 h-4 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded bg-foreground shadow"
          style={{ left: `${invert ? 100 - cur : cur}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-muted-foreground/60">
        {invert ? (
          <>
            <span>高 {show(m.max)}</span><span>80% {show(m.p80)}</span><span>中 {show(m.p50)}</span><span>20% {show(m.p20)}</span><span>低 {show(m.min)}</span>
          </>
        ) : (
          <>
            <span>低 {show(m.min)}</span><span>20% {show(m.p20)}</span><span>中 {show(m.p50)}</span><span>80% {show(m.p80)}</span><span>高 {show(m.max)}</span>
          </>
        )}
      </div>
      {invert && (
        <p className="mt-1 text-[10px] text-primary/80">⚠ ROE 方向与 PE/PB 相反：<b>值越大越低估</b>。X 轴从大到小（左=高分位），绿=历史高位（低估），红=历史低位（高估）</p>
      )}
    </div>
  );
}

// 分页控件：上一页 / 第 N / M 页 / 下一页（供研报、巨潮公告、新闻复用）
function Pager({ page, totalPages, loading, onPrev, onNext }: {
  page: number; totalPages: number; loading: boolean; onPrev: () => void; onNext: () => void;
}) {
  const btn = "inline-flex items-center gap-0.5 rounded border border-border/60 px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <div className="mt-3 flex items-center justify-end gap-2">
      <button onClick={onPrev} disabled={page <= 1 || loading} className={btn}>
        <ChevronLeft className="h-3 w-3" /> 上一页
      </button>
      <span className="text-xs text-muted-foreground">
        第 {page} 页{totalPages > 0 ? ` / 共 ${totalPages} 页` : ""}
      </span>
      <button onClick={onNext} disabled={totalPages <= 0 || page >= totalPages || loading} className={btn}>
        下一页 <ChevronRight className="h-3 w-3" />
      </button>
    </div>
  );
}

export function StockData() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [val, setVal] = useState<Valuation | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [pctl, setPctl] = useState<ValPercentile | null>(null);
  const [fin, setFin] = useState<Financials | null>(null);
  const [anns, setAnns] = useState<Announcement[]>([]);
  const [depNote, setDepNote] = useState<string | null>(null);
  // 资金面 / 筹码 / 信号（v3.3 并入）
  const [margin, setMargin] = useState<MarginRow[]>([]);
  const [blockT, setBlockT] = useState<BlockTradeRow[]>([]);
  const [holders, setHolders] = useState<HolderRow[]>([]);
  const [dividend, setDividend] = useState<DividendRow[]>([]);
  const [fundFlow, setFundFlow] = useState<FundFlowRow[]>([]);
  const [dt, setDt] = useState<DragonTiger | null>(null);
  const [lockup, setLockup] = useState<Lockup | null>(null);
  const [blocks, setBlocks] = useState<Blocks | null>(null);
  const [hotCon, setHotCon] = useState<HotConcept[]>([]);
  const [qa, setQa] = useState<QaRow[]>([]);
  const [gstock, setGStock] = useState<GlobalStock | null>(null);  // 美股 / 港股
  const [cashflow, setCashflow] = useState<HkCashflow | null>(null);  // 港股现金流量表（仅港股）
  const [klineData, setKlineData] = useState<Record<string, number>[] | null>(null);
  const [klineErr, setKlineErr] = useState<string | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);  // 公司基本档案
  // 研报 / 巨潮公告 / 新闻 分页（默认每页 PAGE_SIZE 条，可翻更早数据）
  const [reportsPage, setReportsPage] = useState(1);
  const [annsPage, setAnnsPage] = useState(1);
  const [newsPage, setNewsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(0);
  const [annsTotalPages, setAnnsTotalPages] = useState(0);
  const [newsTotalPages, setNewsTotalPages] = useState(0);
  const [pageLoading, setPageLoading] = useState<"" | "reports" | "anns" | "news">("");
  const runIdRef = useRef(0);

  // 翻页：命中空页时回退一页（避免翻到空白页）；记录总页数供 Pager 显示
  const gotoReports = (p: number) => {
    const c = val?.code; if (!c || p < 1) return;
    setPageLoading("reports");
    api.reports(c, p, PAGE_SIZE)
      .then((res) => { if (p > 1 && res.items.length === 0) { setReportsPage(p - 1); return; }
        setReports(res.items); setReportsPage(p); setReportsTotalPages(res.total_pages); })
      .catch(() => {}).finally(() => setPageLoading(""));
  };
  const gotoAnns = (p: number) => {
    const c = val?.code; if (!c || p < 1) return;
    setPageLoading("anns");
    api.disclosure(c, PAGE_SIZE, p)
      .then((res) => { if (p > 1 && res.items.length === 0) { setAnnsPage(p - 1); return; }
        setAnns(res.items); setAnnsPage(p); setAnnsTotalPages(res.total_pages); })
      .catch(() => {}).finally(() => setPageLoading(""));
  };
  const gotoNews = (p: number) => {
    const c = val?.code; if (!c || p < 1) return;
    setPageLoading("news");
    api.news(c, PAGE_SIZE, p)
      .then((res) => { if (p > 1 && res.items.length === 0) { setNewsPage(p - 1); return; }
        setNews(res.items); setNewsPage(p); setNewsTotalPages(res.total_pages); })
      .catch(() => {}).finally(() => setPageLoading(""));
  };

  const run = async (overrideCode?: string) => {
    const c = (overrideCode || code).trim().toUpperCase();
    if (!c) { setErr("请输入代码"); return; }
    const rid = ++runIdRef.current;
    setLoading(true); setErr(null); setDepNote(null); setVal(null); setReports([]); setNews([]); setPctl(null); setFin(null); setAnns([]);
    setMargin([]); setBlockT([]); setHolders([]); setDividend([]); setFundFlow([]); setDt(null); setLockup(null); setBlocks(null); setHotCon([]); setQa([]);
    setGStock(null); setCashflow(null);
    setKlineData(null); setKlineErr(null);
    setCompany(null);
    // 分页复位（新查询从第 1 页开始）
    setReportsPage(1); setAnnsPage(1); setNewsPage(1);
    setReportsTotalPages(0); setAnnsTotalPages(0); setNewsTotalPages(0);

    // 6 位纯数字 = A 股；否则（字母 / 港股短代码）走美股 / 港股（global-stock-data）
    if (!/^\d{6}$/.test(c)) {
      // 港股现金流独立回填（美股返回 404 → 静默留空，卡片不渲染）
      api.hkCashflow(c).then((cf) => { if (rid === runIdRef.current) setCashflow(cf); }).catch(() => { if (rid === runIdRef.current) setCashflow(null); });
      try {
        const g = await api.globalStock(c);
        if (rid === runIdRef.current) setGStock(g);
      } catch (e) {
        if (rid === runIdRef.current) setErr(e instanceof ApiError ? e.message : "查询失败");
      } finally {
        if (rid === runIdRef.current) setLoading(false);
      }
      return;
    }

    // A 股：竞态守卫（快速换代码时只让最新一次回填）+ 资金面/筹码独立回填、不阻塞主数据
    const ok = <T,>(set: (v: T) => void) => (v: T) => { if (rid === runIdRef.current) set(v); };
    api.margin(c).then(ok(setMargin)).catch(() => {});
    api.blockTrade(c).then(ok(setBlockT)).catch(() => {});
    api.holders(c).then(ok(setHolders)).catch(() => {});
    api.dividend(c).then(ok(setDividend)).catch(() => {});
    api.fundFlow(c).then(ok(setFundFlow)).catch(() => {});
    api.dragonTiger(c).then(ok(setDt)).catch(() => {});
    api.lockup(c).then(ok(setLockup)).catch(() => {});
    api.blocks(c).then(ok(setBlocks)).catch(() => {});
    api.hotConcepts(c).then(ok(setHotCon)).catch(() => {});
    api.investorQa(c).then(ok(setQa)).catch(() => {});
    api.info(c).then(ok(setCompany)).catch(() => {});
    api.kline(c, 4, 120).then(ok(setKlineData)).catch((e) => {
      if (rid === runIdRef.current) setKlineErr(e instanceof ApiError ? e.message : null);
    });
    try {
      // 行情+估值+研报+历史分位+财务+巨潮公告（含 PDF 下载；新闻单独降级）——均取第 1 页
      const emptyPage = { items: [], page: 1, page_size: PAGE_SIZE, total: 0, total_pages: 0 };
      const [v, r, p, f, a] = await Promise.all([
        api.valuation(c),
        api.reports(c, 1, PAGE_SIZE).catch(() => emptyPage),
        api.percentile(c).catch(() => null),
        api.financials(c).catch(() => null),
        api.disclosure(c, PAGE_SIZE, 1).catch(() => emptyPage),
      ]);
      if (rid !== runIdRef.current) return;
      setVal(v);
      setReports(r.items); setReportsTotalPages(r.total_pages);
      setPctl(p);
      setFin(f);
      setAnns(a.items); setAnnsTotalPages(a.total_pages);
      try {
        const n = await api.news(c, PAGE_SIZE, 1);
        if (rid === runIdRef.current) { setNews(n.items); setNewsTotalPages(n.total_pages); }
      } catch (e) {
        if (rid === runIdRef.current && e instanceof ApiError && e.status === 501) setDepNote(e.message);
      }
    } catch (e) {
      if (rid !== runIdRef.current) return;
      setErr(e instanceof ApiError ? e.message : "查询失败");
    } finally {
      if (rid === runIdRef.current) setLoading(false);
    }
  };

  // 支持从其它页面跳转带 ?code=xxx 进入时自动查询该个股（如「股票筛选」点「查看」）。
  // 依赖参数值：首次进入或 URL 上的 code 变化时触发；同一代码不重复触发。
  const paramCode = (searchParams.get("code") || "").trim();
  const lastParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!paramCode || lastParamRef.current === paramCode) return;
    lastParamRef.current = paramCode;
    setCode(paramCode);
    void run(paramCode);
    // run 为组件内闭包，按参数触发即可，无需列入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCode]);

  const metrics = val ? [
    { k: "现价", v: fmt(val.price) },
    { k: "PE(TTM)", v: fmt(val.pe_ttm) },
    { k: "PB", v: fmt(val.pb) },
    { k: "总市值", v: fmt(val.mcap_yi, " 亿") },
    { k: "26E EPS", v: fmt(val.eps_26e) },
    { k: "前向PE", v: fmt(val.pe_26e) },
    { k: "PEG", v: fmt(val.peg) },
    { k: "消化年数", v: fmt(val.digest_years, " 年") },
  ] : [];

  const aiContext = val
    ? `个股：${val.name}（${val.code}）\n现价 ${val.price} · PE(TTM) ${val.pe_ttm} · PB ${val.pb} · 市值 ${val.mcap_yi}亿\n` +
      `26E EPS ${val.eps_26e ?? "—"} · 前向PE ${val.pe_26e ?? "—"} · PEG ${val.peg ?? "—"} · 消化 ${val.digest_years ?? "—"}年 · 机构覆盖 ${val.analyst_count} 家\n` +
      (pctl?.metrics.pe_ttm ? `估值历史分位(近5年)：PE-TTM 处于 ${pctl.metrics.pe_ttm.percentile}% 分位、PB 处于 ${pctl.metrics.pb?.percentile ?? "—"}% 分位、总市值(规模) 处于 ${pctl.metrics.mcap?.percentile ?? "—"}% 分位、ROE(年报,值越大越低估) 处于 ${pctl.metrics.roe?.percentile ?? "—"}% 分位\n` : "") +
      (fin?.revenue ? `财务(${fin.period ?? "—"})：营收 ${fin.revenue}(同比${fin.revenue_yoy ?? "—"})、净利 ${fin.net_profit ?? "—"}(同比${fin.net_profit_yoy ?? "—"})、ROE ${fin.roe ?? "—"}、毛利率 ${fin.gross_margin ?? "—"}\n` : "") +
      (anns.length ? `巨潮公告：${anns.slice(0, 5).map((a) => a.title.replace(/^[^:：]*[:：]/, "")).join("；")}\n` : "") +
      `近期研报：${reports.slice(0, 5).map((r) => r.title).join("；") || "无"}`
    : "还没查询个股。输入 6 位代码后可让 AI 基于客观数据帮你分析。";

  const gAiContext = gstock
    ? `个股（${mktName(gstock.market)}）：${gstock.name}（${gstock.code}）\n` +
      `现价 ${gstock.quote.price ?? "—"} · 涨跌 ${pctStr(gstock.quote.change_pct)} · 总市值 ${bigMoney(gstock.quote.mcap, gstock.market)}\n` +
      (gstock.metrics
        ? `财务(${gstock.metrics.report_date})：营收 ${bigMoney(gstock.metrics.revenue, gstock.market)}(同比${round2(gstock.metrics.revenue_yoy, "%")})、归母净利 ${bigMoney(gstock.metrics.net_profit, gstock.market)}、EPS ${gstock.metrics.eps ?? "—"}、ROE ${round2(gstock.metrics.roe, "%")}、毛利率 ${round2(gstock.metrics.gross_margin, "%")}、净利率 ${round2(gstock.metrics.net_margin, "%")}、资产负债率 ${round2(gstock.metrics.debt_ratio, "%")}`
        : "")
    : "";

  return (
    <div>
      <PageHeader
        title="个股数据"
        subtitle="行情 · 估值 · 研报 · 新闻 —— 客观数据配齐，判断交给你的 AI"
        actions={(val || gstock) && (
          <AskAiButton
            context={gstock ? gAiContext : aiContext}
            // 本页不换路由就能换标的，必须按代码分开存对话，否则会串台。
            // ⚠️ 用**已解析结果**的代码，不能用输入框的 code——后者一边打字一边变，
            // 而 val/gstock 和 AI 上下文仍描述上一只票，会把旧上下文存到新代码名下。
            scopeKey={gstock ? `g:${gstock.code}` : val?.code}
            label="让 AI 读这些数据"
            suggestions={gstock
              ? ["这家公司基本面怎么样", "盈利能力如何", "有什么风险"]
              : ["这个估值贵不贵", "机构一致预期怎么看", "近期研报的分歧点", "有什么风险"]}
          />
        )}
      />

      {/* 查询框 */}
      <div className="mb-5">
        <StockCodeInput
          value={code}
          onChange={setCode}
          onSearch={run}
          loading={loading}
        />
      </div>

      {err && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {err}
        </div>
      )}

      {/* 美股 / 港股视图（global-stock-data，东财域内源） */}
      {gstock && (
        <>
          <GlassCard glow className="mb-4">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-bold">{gstock.name}</h2>
              <span className="font-mono text-sm text-muted-foreground">{gstock.code}</span>
              <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">{gstock.market}</span>
              <span className="ml-auto text-xs text-muted-foreground">{mktName(gstock.market)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: "现价", v: fmt(gstock.quote.price), cls: pctColor(gstock.quote.change_pct) },
                { k: "涨跌幅", v: pctStr(gstock.quote.change_pct), cls: pctColor(gstock.quote.change_pct) },
                { k: "总市值", v: bigMoney(gstock.quote.mcap, gstock.market), cls: "" },
                { k: "成交额", v: bigMoney(gstock.quote.amount, gstock.market), cls: "" },
                { k: "开盘", v: fmt(gstock.quote.open), cls: "" },
                { k: "最高", v: fmt(gstock.quote.high), cls: "" },
                { k: "最低", v: fmt(gstock.quote.low), cls: "" },
                { k: "昨收", v: fmt(gstock.quote.prev_close), cls: "" },
              ].map((m) => (
                <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{m.k}</p>
                  <p className={cn("mt-0.5 font-mono text-base font-bold", m.cls)}>{m.v}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {gstock.metrics && (
            <GlassCard className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> 关键财务指标
                <span className="text-xs font-normal text-muted-foreground/60">· {gstock.metrics.report_date}</span>
              </h3>
              <p className="mb-3 text-[11px] text-muted-foreground/60">东财 GMAININDICATOR，最新报告期。金额为原生币种。</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "营业收入", v: bigMoney(gstock.metrics.revenue, gstock.market), yoy: gstock.metrics.revenue_yoy != null ? round2(gstock.metrics.revenue_yoy, "%") : "" },
                  { k: "归母净利", v: bigMoney(gstock.metrics.net_profit, gstock.market), yoy: "" },
                  { k: "每股收益 EPS", v: round2(gstock.metrics.eps), yoy: "" },
                  { k: "ROE", v: round2(gstock.metrics.roe, "%"), yoy: "" },
                  { k: "毛利率", v: round2(gstock.metrics.gross_margin, "%"), yoy: "" },
                  { k: "净利率", v: round2(gstock.metrics.net_margin, "%"), yoy: "" },
                  { k: "资产负债率", v: round2(gstock.metrics.debt_ratio, "%"), yoy: "" },
                ].map((m) => (
                  <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{m.k}</p>
                    <p className="mt-0.5 font-mono text-base font-bold">{m.v}</p>
                    {m.yoy && <p className="text-[11px] text-muted-foreground">同比 {m.yoy}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {cashflow && cashflow.periods.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-primary" /> 现金流量表
                <span className="text-xs font-normal text-muted-foreground/60">· 单位：亿{cashflow.currency ?? ""}</span>
              </h3>
              <p className="mb-3 text-[11px] text-muted-foreground/60">东财 RPT_HKSK_FN_CASHFLOW · 季度为年初至今累计 · 负数（现金流出）标绿。</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground">
                      <th className="py-1 pr-3 text-left font-normal">科目</th>
                      {cashflow.periods.slice(0, 5).map((p) => (
                        <th key={p.report_date} className="px-2 py-1 text-right font-normal">{p.report_date.slice(0, 7)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cashflow.item_order.map((it) => (
                      <tr key={it} className="border-t border-border/40">
                        <td className="py-1.5 pr-3 text-muted-foreground">{it}</td>
                        {cashflow.periods.slice(0, 5).map((p) => {
                          const amt = p.items[it]?.amount ?? null;
                          return (
                            <td key={p.report_date} className={cn("px-2 py-1.5 text-right font-mono", amt != null && amt < 0 ? "text-success" : "")}>
                              {amt == null ? "—" : (amt / 1e8).toFixed(1)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          )}

          <p className="text-xs text-muted-foreground/60">
            美股 / 港股数据来自 <a href="https://github.com/simonlin1212/global-stock-data" target="_blank" rel="noreferrer" className="hover:text-primary">global-stock-data</a>（东财域内源）· 金额为原生币种 · 仅客观数据，不含买卖建议。
          </p>
        </>
      )}

      {val && (
        <>
          <GlassCard glow className="mb-4">
            <div className="mb-4 flex items-baseline gap-2">
              <h2 className="text-xl font-bold">{val.name}</h2>
              <span className="font-mono text-sm text-muted-foreground">{val.code}</span>
              {val.analyst_count > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">机构覆盖 {val.analyst_count} 家</span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{m.k}</p>
                  <p className="mt-0.5 font-mono text-lg font-bold">{m.v}</p>
                </div>
              ))}
            </div>
            {val.forecast_note && (
              <p className="mt-3 text-xs text-warning">{val.forecast_note}</p>
            )}
          </GlassCard>

          {/* K 线图（日K · 前复权）——上方独立子窗口 */}
          {val && (
            <KLineChart
              data={klineData}
              symbol={`${val.name}（${val.code}）`}
              loading={loading}
              error={klineErr}
            />
          )}

          {/* 公司基本档案（行业/板块/股本/市值/52周/上市日期）——K线之下、财报速览之上 */}
          {company && (company.industry || company.total_shares != null) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
                <Building2 className="h-4 w-4 text-primary" /> 公司基本档案
                <span className="text-xs font-normal text-muted-foreground/60">东财 · 静态资料</span>
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "所属行业", v: company.industry || "—" },
                  { k: "所属板块", v: company.board || "—" },
                  { k: "总市值", v: company.mcap != null ? money(company.mcap) : "—" },
                  { k: "总股本", v: company.total_shares != null ? `${(company.total_shares / 1e8).toFixed(2)} 亿股` : "—" },
                  { k: "流通股", v: company.float_shares != null ? `${(company.float_shares / 1e8).toFixed(2)} 亿股` : "—" },
                  { k: "52周最高", v: company.week52_high != null ? `${company.week52_high.toFixed(2)}` : "—" },
                  { k: "52周最低", v: company.week52_low != null ? `${company.week52_low.toFixed(2)}` : "—" },
                  { k: "上市日期", v: company.list_date || "—" },
                ].map((m) => (
                  <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{m.k}</p>
                    <p className="mt-0.5 font-mono text-sm font-bold">{m.v}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {/* 财报速览（结论先行摘要，借鉴 equity-research 的结构纪律，剔除评级/目标价） */}
          <EarningsSnapshot val={val} fin={fin} pctl={pctl} />

          {pctl && (pctl.metrics.pe_ttm || pctl.metrics.pb || pctl.metrics.mcap || pctl.metrics.roe) && (
            <GlassCard glow className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><LineChart className="h-4 w-4 text-primary" /> 估值历史分位 · {pctl.period}</h3>
              <p className="mb-4 text-[11px] text-muted-foreground/60">绿=低估区 / 灰=合理区 / 红=高估区。只显示当前处于历史什么位置，不构成买卖建议。总市值为规模分位；ROE 方向相反（值越大越低估，轴从大到小）。</p>
              <div className="space-y-4">
                {pctl.metrics.pe_ttm && <ValBand label="PE-TTM" m={pctl.metrics.pe_ttm} />}
                {pctl.metrics.pb && <ValBand label="市净率 PB" m={pctl.metrics.pb} />}
                {pctl.metrics.mcap && <ValBand label="总市值（规模）" m={pctl.metrics.mcap} fmt={(v) => (v >= 10000 ? `${(v / 10000).toFixed(2)} 万亿` : `${v.toFixed(0)} 亿`)} />}
                {pctl.metrics.roe && <ValBand label="ROE（年报）" m={pctl.metrics.roe} invert />}
              </div>
            </GlassCard>
          )}

          {/* 价格正态分布 */}
          {val && (
            <PriceDistribution
              data={klineData}
              currentPrice={val.price}
              loading={loading}
              error={klineErr}
            />
          )}

          {fin && (fin.revenue || fin.roe) && (
            <GlassCard className="mb-4">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" /> 财务关键指标{fin.period && <span className="text-xs font-normal text-muted-foreground/60">· {fin.period}</span>}</h3>
              <p className="mb-3 text-[11px] text-muted-foreground/60">同花顺财务摘要,最新报告期。</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { k: "营业总收入", v: fin.revenue, yoy: fin.revenue_yoy },
                  { k: "归母净利润", v: fin.net_profit, yoy: fin.net_profit_yoy },
                  { k: "每股收益", v: fin.eps },
                  { k: "ROE", v: fin.roe },
                  { k: "销售毛利率", v: fin.gross_margin },
                  { k: "销售净利率", v: fin.net_margin },
                  { k: "每股净资产", v: fin.bvps },
                  { k: "每股经营现金流", v: fin.op_cf_ps },
                ].map((m) => (
                  <div key={m.k} className="rounded-lg bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground">{m.k}</p>
                    <p className="mt-0.5 font-mono text-base font-bold">{m.v ?? "—"}</p>
                    {m.yoy && <p className="text-[11px] text-muted-foreground">同比 {m.yoy}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}

          {reports.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-primary" /> 近期研报（本页 {reports.length}）</h3>
              <div className="space-y-2">
                {reports.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{(r.publishDate || "").slice(0, 10)}</span>
                    <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{r.orgSName}</span>
                    <span className="w-14 shrink-0">
                      {r.emRatingName
                        ? <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">{r.emRatingName}</span>
                        : <span className="text-[10px] text-muted-foreground/40">—</span>}
                    </span>
                    <span className="flex-1 truncate" title={r.title}>{r.title}</span>
                    {r.pdfUrl && (
                      <a href={r.pdfUrl} target="_blank" rel="noreferrer" title="下载研报 PDF"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary">
                        <Download className="h-3 w-3" /> PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <Pager page={reportsPage} totalPages={reportsTotalPages} loading={pageLoading === "reports"}
                onPrev={() => gotoReports(reportsPage - 1)} onNext={() => gotoReports(reportsPage + 1)} />
            </GlassCard>
          )}

          {anns.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Megaphone className="h-4 w-4 text-primary" /> 巨潮公告（本页 {anns.length}）</h3>
              <div className="space-y-2">
                {anns.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{a.date}</span>
                    {a.type && <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{a.type}</span>}
                    {a.url ? (
                      <a href={a.url} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary" title={a.title}>{a.title.replace(/^[^:：]*[:：]/, "")}</a>
                    ) : (
                      <span className="flex-1 truncate" title={a.title}>{a.title}</span>
                    )}
                    {a.pdf_url && (
                      <a href={a.pdf_url} target="_blank" rel="noreferrer" title="下载 PDF"
                        className="inline-flex shrink-0 items-center gap-0.5 rounded border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground hover:border-primary/50 hover:text-primary">
                        <Download className="h-3 w-3" /> PDF
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <Pager page={annsPage} totalPages={annsTotalPages} loading={pageLoading === "anns"}
                onPrev={() => gotoAnns(annsPage - 1)} onNext={() => gotoAnns(annsPage + 1)} />
            </GlassCard>
          )}

          <GlassCard>
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Newspaper className="h-4 w-4 text-primary" /> 个股新闻（本页 {news.length}）</h3>
            {depNote ? (
              <p className="text-xs text-warning">{depNote}（安装后新闻/公告即可用）</p>
            ) : news.length === 0 ? (
              <p className="text-xs text-muted-foreground/60">暂无新闻</p>
            ) : (
              <>
                <div className="space-y-2">
                  {news.map((n, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{(n.发布时间 || "").slice(0, 16)}</span>
                    {n.文章来源 && <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{n.文章来源}</span>}
                    {n.新闻链接 ? (
                      <a href={n.新闻链接} target="_blank" rel="noreferrer" className="flex-1 truncate hover:text-primary" title={n.新闻内容 || n.新闻标题}>{n.新闻标题}</a>
                    ) : (
                      <span className="flex-1 truncate" title={n.新闻内容 || n.新闻标题}>{n.新闻标题}</span>
                    )}
                  </div>
                ))}
                </div>
                <Pager page={newsPage} totalPages={newsTotalPages} loading={pageLoading === "news"}
                  onPrev={() => gotoNews(newsPage - 1)} onNext={() => gotoNews(newsPage + 1)} />
              </>
            )}
          </GlassCard>

          {/* 资金面 · 筹码（融资融券 / 股东户数 / 主力资金流 / 分红 / 大宗交易） */}
          {(margin.length > 0 || holders.length > 0 || fundFlow.length > 0 || dividend.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Wallet className="h-4 w-4 text-primary" /> 资金面 · 筹码</h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {margin[0] && <Metric k="融资余额" v={yi(margin[0].rzye)} sub={margin[0].date} />}
                {margin[0] && <Metric k="融券余额" v={yi(margin[0].rqye)} />}
                {holders[0] && <Metric k="股东户数" v={Number(holders[0].holder_num).toLocaleString()} sub={`环比 ${pct(holders[0].change_ratio)}`} />}
                {fundFlow.length > 0 && <Metric k="近20日主力净流入" v={yi(fundFlow.slice(-20).reduce((s, r) => s + r.main_net, 0))} />}
                {dividend[0] && <Metric k="最近派息(每10股)" v={`${dividend[0].bonus_rmb} 元`} sub={dividend[0].date} />}
              </div>
              {blockT.length > 0 && (
                <div className="mt-3 border-t border-border/40 pt-3">
                  <p className="mb-2 text-xs text-muted-foreground">近期大宗交易（{blockT.length}）</p>
                  <div className="space-y-1.5">
                    {blockT.slice(0, 5).map((b, i) => (
                      <div key={i} className="flex items-center gap-3 text-xs">
                        <span className="w-20 shrink-0 font-mono text-muted-foreground">{b.date}</span>
                        <span className="w-14 shrink-0">{b.price} 元</span>
                        <span className={cn("w-20 shrink-0", b.premium_pct >= 0 ? "text-danger" : "text-success")}>折溢 {b.premium_pct}%</span>
                        <span className="flex-1 truncate text-muted-foreground">买 {b.buyer} · 卖 {b.seller}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-3 text-[11px] text-muted-foreground/60">资金/筹码为公开客观数据，仅供了解该股当前状态，不构成任何买卖建议。</p>
            </GlassCard>
          )}

          {/* 龙虎榜 */}
          {dt && dt.records.length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Trophy className="h-4 w-4 text-primary" /> 龙虎榜（近30日 {dt.records.length} 次）</h3>
              <div className="space-y-2">
                {dt.records.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 border-b border-border/40 pb-2 text-sm last:border-0">
                    <span className="w-20 shrink-0 font-mono text-xs text-muted-foreground">{r.date}</span>
                    <span className="flex-1 truncate">{r.reason}</span>
                    <span className={cn("shrink-0 font-mono text-xs", r.net_buy >= 0 ? "text-danger" : "text-success")}>净买 {r.net_buy} 万</span>
                  </div>
                ))}
              </div>
              {(dt.seats.buy.length > 0 || dt.seats.sell.length > 0) && (
                <div className="mt-3 grid gap-4 border-t border-border/40 pt-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-danger">买入席位 TOP</p>
                    {dt.seats.buy.map((s, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{s.name}</span><span className="shrink-0 font-mono">净{s.net}万</span></div>
                    ))}
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-success">卖出席位 TOP</p>
                    {dt.seats.sell.map((s, i) => (
                      <div key={i} className="flex justify-between gap-2 text-xs text-muted-foreground"><span className="truncate">{s.name}</span><span className="shrink-0 font-mono">净{s.net}万</span></div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* 限售解禁 */}
          {lockup && (lockup.upcoming.length > 0 || lockup.history.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" /> 限售解禁</h3>
              {lockup.upcoming.length > 0 ? (
                <div className="mb-3 rounded-lg border border-warning/30 bg-warning/5 p-3">
                  <p className="mb-1.5 text-xs font-medium text-warning">未来 90 天待解禁（{lockup.upcoming.length}）</p>
                  {lockup.upcoming.slice(0, 4).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs"><span className="w-20 shrink-0 font-mono text-muted-foreground">{h.date}</span><span className="flex-1 truncate">{h.type}</span><span className="shrink-0 text-muted-foreground">占比 {pct(h.ratio)}</span></div>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-xs text-muted-foreground/70">未来 90 天无待解禁。</p>
              )}
              {lockup.history.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">历史解禁（近 {Math.min(lockup.history.length, 5)}）</p>
                  {lockup.history.slice(0, 5).map((h, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs"><span className="w-20 shrink-0 font-mono text-muted-foreground">{h.date}</span><span className="flex-1 truncate text-muted-foreground">{h.type}</span></div>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* 板块归属 · 概念 */}
          {((blocks && blocks.concept_tags.length > 0) || hotCon.length > 0) && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><Boxes className="h-4 w-4 text-primary" /> 板块归属 · 概念</h3>
              {blocks && blocks.concept_tags.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {blocks.concept_tags.slice(0, 24).map((t, i) => (
                    <span key={i} className="rounded-full border border-border/70 px-2 py-0.5 text-xs text-muted-foreground">{t}</span>
                  ))}
                </div>
              )}
              {hotCon.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs text-muted-foreground">当下热门概念命中</p>
                  <div className="flex flex-wrap gap-1.5">
                    {hotCon.slice(0, 12).map((h, i) => (
                      <span key={i} className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">{h.concept}</span>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          )}

          {/* 投资者互动（互动易） */}
          {qa.filter((q) => q.answer).length > 0 && (
            <GlassCard className="mb-4">
              <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4 text-primary" /> 投资者互动（互动易）</h3>
              <div className="space-y-3">
                {qa.filter((q) => q.answer).slice(0, 5).map((q, i) => (
                  <div key={i} className="border-b border-border/40 pb-3 text-sm last:border-0">
                    <p className="text-muted-foreground"><span className="mr-1.5 rounded bg-muted/50 px-1.5 py-0.5 text-[10px]">问</span>{q.question}</p>
                    <p className="mt-1"><span className="mr-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">答</span>{q.answer}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">{q.ask_time}</p>
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}

      {!val && !err && !loading && (
        <GlassCard>
          <div className="py-10 text-center text-sm text-muted-foreground">
            输入一个 6 位股票代码，拉取它的行情、估值、研报与新闻。<br />
            <span className="text-xs text-muted-foreground/60">数据来自公开源（腾讯行情 / 东财研报 / akshare）；Vibe-Research 不预置任何标的、不做推荐。</span>
          </div>
        </GlassCard>
      )}

      <Disclaimer />
    </div>
  );
}
