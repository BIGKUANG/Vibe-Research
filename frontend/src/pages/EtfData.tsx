import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, AlertTriangle, Newspaper } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { AskAiButton } from "@/components/ui/AskAiButton";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { Pager } from "@/components/ui/Pager";
import { StockCodeInput } from "@/components/stock/StockCodeInput";
import { KLineChart } from "@/components/stock/KLineChart";
import { EtfOverview } from "@/components/etf/EtfOverview";
import { EtfProfileCard } from "@/components/etf/EtfProfileCard";
import { EtfScaleSection } from "@/components/etf/EtfScaleSection";
import { EtfNavSection } from "@/components/etf/EtfNavSection";
import { EtfHoldings } from "@/components/etf/EtfHoldings";
import { EtfDividends } from "@/components/etf/EtfDividends";
import {
  api, ApiError,
  type EtfDividendsData, type EtfHoldingsData, type EtfNavData, type EtfProfile,
  type EtfSizeData, type NewsItem, type Quote,
} from "@/lib/api";
import { findEtf, localEtfProfile, normalizeFundCode } from "@/lib/etf";
import { STOCK_CODES } from "@/data/stock_codes";

type Range = "1y" | "3y" | "all";
const PAGE_SIZE = 15;
const STOCK_SET = new Set(STOCK_CODES.filter((s) => /^\d{6}$/.test(s.code)).map((s) => s.code));
const looksLikeEtf = (c: string) => /^5\d{5}$/.test(c) || /^1[5-8]\d{4}$/.test(c);

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : "请求失败");
const fmt = (v: number | null | undefined, d = 2, s = "") => (v == null || !Number.isFinite(Number(v)) ? "—" : `${Number(v).toFixed(d)}${s}`);
const last = <T,>(arr: T[] | undefined): T | null => (arr && arr.length ? arr[arr.length - 1] : null);

export function EtfData() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [code, setCode] = useState("");
  const [profile, setProfile] = useState<EtfProfile | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [kline, setKline] = useState<Record<string, number>[] | null>(null);
  const [sizeData, setSizeData] = useState<EtfSizeData | null>(null);
  const [navData, setNavData] = useState<EtfNavData | null>(null);
  const [holdings, setHoldings] = useState<EtfHoldingsData | null>(null);
  const [dividends, setDividends] = useState<EtfDividendsData | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsPage, setNewsPage] = useState(1);
  const [newsTotalPages, setNewsTotalPages] = useState(0);
  const [newsLoading, setNewsLoading] = useState(false);

  const [sizeRange, setSizeRange] = useState<Range>("1y");
  const [navRange, setNavRange] = useState<Range>("1y");
  const [sizeLoading, setSizeLoading] = useState(false);
  const [navLoading, setNavLoading] = useState(false);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [divLoading, setDivLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [pageErr, setPageErr] = useState<string | null>(null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const [klineErr, setKlineErr] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const sizeReqRef = useRef(0);
  const navReqRef = useRef(0);
  const lastParamRef = useRef<string | null>(null);

  const setErr = useCallback((key: string, msg: string | null) => {
    setErrs((prev) => {
      const next = { ...prev };
      if (msg) next[key] = msg; else delete next[key];
      return next;
    });
  }, []);

  const fetchSize = useCallback((c: string, range: Range, rid: number) => {
    const token = ++sizeReqRef.current;
    setSizeLoading(true);
    setErr("规模", null);
    api.etfSize(c, range)
      .then((d) => { if (rid === runIdRef.current && token === sizeReqRef.current) setSizeData(d); })
      .catch((e) => { if (rid === runIdRef.current && token === sizeReqRef.current) { setSizeData(null); setErr("规模", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current && token === sizeReqRef.current) setSizeLoading(false); });
  }, [setErr]);

  const fetchNav = useCallback((c: string, range: Range, rid: number) => {
    const token = ++navReqRef.current;
    setNavLoading(true);
    setErr("净值", null);
    api.etfNav(c, range)
      .then((d) => { if (rid === runIdRef.current && token === navReqRef.current) setNavData(d); })
      .catch((e) => { if (rid === runIdRef.current && token === navReqRef.current) { setNavData(null); setErr("净值", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current && token === navReqRef.current) setNavLoading(false); });
  }, [setErr]);

  const fetchNews = useCallback((c: string, page: number, rid: number) => {
    setNewsLoading(true);
    setErr("新闻", null);
    api.news(c, PAGE_SIZE, page)
      .then((res) => {
        if (rid !== runIdRef.current) return;
        setNews(res.items);
        setNewsPage(page);
        setNewsTotalPages(res.total_pages);
      })
      .catch((e) => { if (rid === runIdRef.current) { setNews([]); setNewsTotalPages(0); setErr("新闻", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current) setNewsLoading(false); });
  }, [setErr]);

  const run = useCallback((input?: string) => {
    const raw = (input ?? code).trim();
    if (!raw) { setPageErr("请输入代码"); return; }
    const fundCode = normalizeFundCode(raw);
    const etf = findEtf(fundCode);

    // 非 ETF：股票/海外代码统一交给 /stock-data，保持两个视图独立。
    // 本地表未收录、但号段符合 ETF 的代码仍交给本页尝试，避免新上市 ETF 被误送到个股页。
    if (!etf && !looksLikeEtf(fundCode)) {
      if (/^\d{6}$/.test(fundCode) && STOCK_SET.has(fundCode)) {
        navigate(`/stock-data?code=${fundCode}`);
      } else {
        navigate(`/stock-data?code=${encodeURIComponent(raw)}`);
      }
      return;
    }

    const rid = ++runIdRef.current;
    setCode(fundCode);
    setPageErr(null);
    setErrs({});
    setKlineErr(null);
    setLoading(true);

    // 本地档案先行渲染（无 token 也能看基本信息），随后用 tushare 档案刷新。
    setProfile(etf ? localEtfProfile(etf) : null);
    setQuote(null);
    setKline(null);
    setSizeData(null);
    setNavData(null);
    setHoldings(null);
    setDividends(null);
    setNews([]);
    setNewsPage(1);
    setNewsTotalPages(0);

    api.etfProfile(fundCode)
      .then((p) => { if (rid === runIdRef.current) setProfile(p); })
      .catch((e) => {
        // 本地表有记录时保留本地快照；本地也没有（新上市/未收录）才报页面级错误。
        if (rid === runIdRef.current && !etf) setPageErr(errText(e));
      });

    api.quote(fundCode)
      .then((m) => { if (rid === runIdRef.current) setQuote(m[fundCode] ?? null); })
      .catch((e) => { if (rid === runIdRef.current) setErr("行情", errText(e)); });

    api.kline(fundCode, 4, 250)
      .then((rows) => { if (rid === runIdRef.current) { setKline(rows); if (rows.length === 0) setKlineErr("暂无 K 线数据"); } })
      .catch((e) => { if (rid === runIdRef.current) { setKline(null); setKlineErr(errText(e)); setErr("K线", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current) setLoading(false); });

    fetchSize(fundCode, sizeRange, rid);
    fetchNav(fundCode, navRange, rid);
    fetchNews(fundCode, 1, rid);

    setHoldingsLoading(true);
    api.etfHoldings(fundCode)
      .then((d) => { if (rid === runIdRef.current) setHoldings(d); })
      .catch((e) => { if (rid === runIdRef.current) { setHoldings(null); setErr("持仓", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current) setHoldingsLoading(false); });

    setDivLoading(true);
    api.etfDividends(fundCode)
      .then((d) => { if (rid === runIdRef.current) setDividends(d); })
      .catch((e) => { if (rid === runIdRef.current) { setDividends(null); setErr("分红", errText(e)); } })
      .finally(() => { if (rid === runIdRef.current) setDivLoading(false); });
  }, [code, navigate, sizeRange, navRange, fetchSize, fetchNav, fetchNews, setErr]);

  const paramCode = (searchParams.get("code") || "").trim();
  useEffect(() => {
    if (!paramCode || lastParamRef.current === paramCode) return;
    lastParamRef.current = paramCode;
    run(paramCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramCode]);

  const onSizeRange = useCallback((r: Range) => {
    setSizeRange(r);
    if (profile) fetchSize(profile.code, r, runIdRef.current);
  }, [profile, fetchSize]);
  const onNavRange = useCallback((r: Range) => {
    setNavRange(r);
    if (profile) fetchNav(profile.code, r, runIdRef.current);
  }, [profile, fetchNav]);

  const aiContext = profile
    ? `ETF：${profile.name}（${profile.code}）\n` +
      `跟踪 ${profile.index_name || "—"} · 管理人 ${profile.mgr_name || "—"} · 类型 ${profile.fund_type} · 管理费 ${fmt(profile.mgt_fee, 2, "%")}\n` +
      `最新价 ${fmt(quote?.price, 3)} · 涨跌 ${fmt(quote?.change_pct, 2, "%")} · 成交额 ${quote?.amount_wan != null ? `${(quote.amount_wan / 1e4).toFixed(2)} 亿` : "—"}\n` +
      `规模(T-1) ${fmt(last(sizeData?.items)?.size_yi, 2, " 亿")} · 份额 ${fmt(last(sizeData?.items)?.share_yi, 2, " 亿份")} · 折溢价(T-1) ${fmt(last(navData?.items)?.premium_pct, 2, "%")}\n` +
      (holdings?.items.length
        ? `前十大持仓(${holdings.period})：${holdings.items.slice(0, 5).map((h) => `${h.name || h.symbol} ${h.ratio_pct ?? "—"}%`).join("；")}\n`
        : "") +
      `规模/净值均为盘后 T-1 口径，不代表实时折溢价。`
    : "";

  const failures = Object.entries(errs);

  return (
    <div>
      <PageHeader
        title="ETF 数据"
        subtitle="行情 · 规模 · 净值 · 持仓 —— 客观数据配齐，判断交给你的 AI"
        actions={profile && (
          <AskAiButton
            context={aiContext}
            scopeKey={profile.code}
            label="让 AI 读这些数据"
            suggestions={["这只 ETF 跟踪什么指数", "规模和份额变化怎么看", "折溢价说明了什么", "有什么风险"]}
          />
        )}
      />

      <div className="mb-5">
        <StockCodeInput value={code} onChange={setCode} onSearch={run} loading={loading} />
      </div>

      {pageErr && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" /> {pageErr}
        </div>
      )}

      {failures.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>部分数据未获取：</span>
          {failures.map(([k, v]) => <span key={k}>{k}（{v}）</span>)}
          <button type="button" onClick={() => run(code)} className="ml-auto rounded border border-warning/40 px-2 py-0.5 hover:bg-warning/10">
            重试
          </button>
        </div>
      )}

      {!profile ? (
        <GlassCard className="mb-4">
          <p className="py-10 text-center text-sm text-muted-foreground/60">
            {loading ? "加载中…" : "输入 ETF 代码或名称后拉取行情、规模、净值、持仓与分红。"}
          </p>
        </GlassCard>
      ) : (
        <>
          <EtfOverview
            profile={profile}
            quote={quote}
            size={last(sizeData?.items)}
            nav={last(navData?.items)}
            quoteError={errs["行情"]}
          />
          <EtfProfileCard profile={profile} />
          <KLineChart data={kline} symbol={`${profile.name}（${profile.code}）`} loading={loading} error={klineErr} />
          <EtfScaleSection
            data={sizeData}
            loading={sizeLoading}
            error={errs["规模"] ?? null}
            range={sizeRange}
            onRange={onSizeRange}
          />
          <EtfNavSection
            data={navData}
            loading={navLoading}
            error={errs["净值"] ?? null}
            range={navRange}
            onRange={onNavRange}
          />
          <EtfHoldings data={holdings} loading={holdingsLoading} error={errs["持仓"] ?? null} />
          <EtfDividends data={dividends} loading={divLoading} error={errs["分红"] ?? null} />

          <GlassCard className="mb-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Newspaper className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">相关新闻</h3>
              <span className="text-xs font-normal text-muted-foreground/60">东财</span>
            </div>
            {newsLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground/60">加载中…</p>
            ) : news.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground/60">
                {errs["新闻"] ? `⚠ 新闻获取失败：${errs["新闻"]}` : "暂无相关新闻"}
              </p>
            ) : (
              <>
                <ul className="divide-y divide-border/40">
                  {news.map((n, i) => (
                    <li key={i} className="py-2">
                      <a href={n.新闻链接 || "#"} target="_blank" rel="noreferrer" className="text-sm hover:text-primary">
                        {n.新闻标题 || "—"}
                      </a>
                      <p className="mt-0.5 text-[11px] text-muted-foreground/60">
                        {n.发布时间 || "—"} · {n.文章来源 || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
                <Pager page={newsPage} totalPages={newsTotalPages} onPage={(p) => fetchNews(profile.code, p, runIdRef.current)} />
              </>
            )}
          </GlassCard>
        </>
      )}

      <Disclaimer />
    </div>
  );
}
