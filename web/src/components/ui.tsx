// Small, consistent UI primitives. Radius encodes hierarchy: panels 14px, wells 10px, controls 8px, chips round.
import Link from "next/link";
import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Tone = "ion" | "arc" | "signal" | "amber" | "rose" | "neutral";
type Variant = "primary" | "secondary" | "ghost" | "danger";

const btnBase = "inline-flex items-center justify-center gap-2 rounded-[8px] font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none select-none whitespace-nowrap";
const btnSize = { sm: "h-8 px-3 text-[13px]", md: "h-9 px-4 text-sm", lg: "h-11 px-5 text-[15px]" };
const btnVariant: Record<Variant, string> = {
  primary: "bg-ion text-white hover:bg-ion-strong shadow-[0_1px_0_rgb(255_255_255/0.15)_inset]",
  secondary: "bg-raised text-ink border border-line hover:border-line-strong hover:bg-surface",
  ghost: "text-muted hover:text-ink hover:bg-raised",
  danger: "bg-rose-soft text-rose border border-rose/40 hover:bg-rose hover:text-white",
};

export function Button({ variant = "secondary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: keyof typeof btnSize }) {
  return <button type="button" className={clsx(btnBase, btnSize[size], btnVariant[variant], className)} {...p} />;
}

export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: keyof typeof btnSize }) {
  return <Link className={clsx(btnBase, btnSize[size], btnVariant[variant], className)} {...p} />;
}

const toneChip: Record<Tone, string> = {
  ion: "bg-ion-soft text-ion-strong", arc: "bg-arc-soft text-arc", signal: "bg-signal-soft text-signal",
  amber: "bg-amber-soft text-amber", rose: "bg-rose-soft text-rose", neutral: "bg-raised text-muted border border-line",
};

export function Chip({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return <span title={title} className={clsx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-medium leading-5", toneChip[tone], className)}>{children}</span>;
}

export function Bar({ value, tone = "ion", className, label }: { value: number; tone?: Tone; className?: string; label?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const fill = { ion: "bg-ion", arc: "bg-arc", signal: "bg-signal", amber: "bg-amber", rose: "bg-rose", neutral: "bg-line-strong" }[tone];
  return (
    <div className={clsx("h-1.5 w-full rounded-full bg-raised overflow-hidden", className)} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={clsx("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Ring({ value, size = 56, stroke = 5, tone = "arc", children, label }: { value: number; size?: number; stroke?: number; tone?: Tone; children?: ReactNode; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { ion: "var(--ion)", arc: "var(--arc)", signal: "var(--signal)", amber: "var(--amber)", rose: "var(--rose)", neutral: "var(--border-strong)" }[tone];
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--raised)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} style={{ transition: "stroke-dashoffset 600ms ease" }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-[68ch] text-muted">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside, id }: { children: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-[15px] font-semibold text-ink">{children}</h2>
      {aside && <div className="text-[13px] text-muted">{aside}</div>}
    </div>
  );
}

export function Empty({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="well flex flex-col items-start gap-2 p-5">
      {icon && <div className="text-faint">{icon}</div>}
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="max-w-[60ch] text-[14px] text-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const color = tone ? { ion: "text-ion-strong", arc: "text-arc", signal: "text-signal", amber: "text-amber", rose: "text-rose", neutral: "text-ink" }[tone] : "text-ink";
  return (
    <div>
      <div className="text-[13px] text-muted">{label}</div>
      <div className={clsx("tabular text-[22px] font-semibold leading-tight", color)}>{value}</div>
      {sub && <div className="mt-0.5 text-[12.5px] text-faint">{sub}</div>}
    </div>
  );
}

export const DIFFICULTY_TONE: Record<string, Tone> = { foundation: "neutral", intermediate: "ion", advanced: "arc", expert: "rose" };
export const DIFFICULTY_LABEL: Record<string, string> = { foundation: "Foundation", intermediate: "Intermediate", advanced: "Advanced", expert: "Expert · exam trap" };

export function pct(v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
