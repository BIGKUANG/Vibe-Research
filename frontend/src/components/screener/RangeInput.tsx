import type { ChangeEvent } from "react";
import { cn } from "@/lib/utils";
import type { RangeCond } from "@/lib/screener";

interface Props {
  value: RangeCond;
  onChange: (v: RangeCond) => void;
  /** 右侧单位提示（如 亿 / %）。 */
  suffix?: string;
  className?: string;
}

// 数值区间输入：空 = 不限。两个等宽右对齐输入框 + 中间分隔符。
export function RangeInput({ value, onChange, suffix, className }: Props) {
  const set = (part: "min" | "max") => (e: ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [part]: e.target.value.replace(/[^\d.\-]/g, "") });

  const inputCls =
    "h-8 w-[68px] rounded-md border border-border bg-black/20 px-2 text-right font-mono text-sm outline-none transition-colors focus:border-primary/50 placeholder:text-muted-foreground/40";

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <input value={value.min} onChange={set("min")} inputMode="decimal" placeholder="不限" className={inputCls} />
      <span className="text-muted-foreground/60">–</span>
      <input value={value.max} onChange={set("max")} inputMode="decimal" placeholder="不限" className={inputCls} />
      {suffix && <span className="text-xs text-muted-foreground/70">{suffix}</span>}
    </div>
  );
}
