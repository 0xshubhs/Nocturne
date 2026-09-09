"use client";

// Nocturne — shared UI primitives.
//
// One rule runs through all of it: mint means private (only this device knows),
// amber means public (the chain knows). If a value is on screen in one of those
// two, it is telling you who can see it. Lavender is the brand — focus rings,
// the wordmark, a primary action — and never carries meaning. Nothing else is
// coloured at all.

import type { ReactNode } from "react";

export type Tone = "neutral" | "private" | "public" | "danger";

const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-fg-muted",
  private: "text-private",
  public: "text-public",
  danger: "text-danger",
};

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-border",
  private: "border-private/25",
  public: "border-public/25",
  danger: "border-danger/30",
};

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

export function Panel({
  title,
  subtitle,
  aside,
  tone = "neutral",
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: string;
  aside?: ReactNode;
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border ${TONE_BORDER[tone]} bg-bg-raised/70 backdrop-blur-sm shadow-[0_1px_0_0_#ffffff08_inset,0_16px_40px_-24px_#00000080] ${className}`}
    >
      {(title || aside) && (
        <header className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-border/60">
          <div className="min-w-0">
            {title && <h2 className="font-display text-[17px] leading-snug">{title}</h2>}
            {subtitle && <p className="text-xs text-fg-dim mt-1.5 leading-relaxed max-w-prose">{subtitle}</p>}
          </div>
          {aside && <div className="shrink-0">{aside}</div>}
        </header>
      )}
      <div className="p-6 flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Labels a whole region as chain-visible or device-only. */
export function VisibilityTag({ tone }: { tone: "private" | "public" }) {
  const isPrivate = tone === "private";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.08em] ${
        isPrivate ? "bg-private/10 text-private" : "bg-public/10 text-public"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isPrivate ? "bg-private" : "bg-public"}`} />
      {isPrivate ? "Device only" : "On-chain"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Data display
// ---------------------------------------------------------------------------

export function Row({
  label,
  hint,
  tone = "neutral",
  children,
}: {
  label: string;
  hint?: string;
  tone?: Tone;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <span className="text-fg-dim shrink-0" title={hint}>
        {label}
      </span>
      <span className={`text-right font-mono tnum ${tone === "neutral" ? "text-fg" : TONE_TEXT[tone]}`}>
        {children}
      </span>
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-bg-inset/70 px-4 py-3.5">
      <div className="text-[10px] uppercase tracking-wider text-fg-dim">{label}</div>
      <div className={`mt-1.5 text-[22px] font-mono tnum ${tone === "neutral" ? "text-fg" : TONE_TEXT[tone]}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-fg-dim">{sub}</div>}
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const styles: Record<Tone, string> = {
    neutral: "bg-white/[0.05] text-fg-muted border-border",
    private: "bg-private/10 text-private border-private/25",
    public: "bg-public/10 text-public border-public/25",
    danger: "bg-danger/10 text-danger border-danger/30",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

export function Meter({ value, tone = "neutral" }: { value: number; tone?: Tone }) {
  const bar: Record<Tone, string> = {
    neutral: "bg-fg-muted",
    private: "bg-private",
    public: "bg-public",
    danger: "bg-danger",
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${bar[tone]}`}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
      />
    </div>
  );
}

/**
 * A hash the reader should recognise as opaque rather than parse. Always
 * monospace, always truncated — it is a pseudonym, not an identifier you look
 * things up by.
 */
export function Hash({ value, chars = 8, tone = "public" }: { value: string; chars?: number; tone?: Tone }) {
  return (
    <code className={`font-mono text-xs ${TONE_TEXT[tone]}`} title={value}>
      {value.length > chars + 6 ? `${value.slice(0, chars)}…${value.slice(-4)}` : value}
    </code>
  );
}

/** A value the chain cannot see — rendered so it reads as withheld, not missing. */
export function Redacted({ children }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-fg-dim">
      <span className="font-mono text-xs tracking-widest select-none">▓▓▓▓▓▓</span>
      {children && <span className="text-xs">{children}</span>}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
  title,
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger" | "private";
  type?: "button" | "submit";
  title?: string;
  full?: boolean;
}) {
  const styles = {
    primary: "bg-accent text-[#0b0c16] hover:brightness-110 font-semibold",
    private: "bg-private/12 text-private border border-private/25 hover:bg-private/20",
    ghost: "border border-border-strong text-fg-muted hover:text-fg hover:border-fg-dim hover:bg-bg-hover",
    danger: "border border-danger/35 text-danger hover:bg-danger/10",
  }[variant];

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`h-10 px-5 rounded-full text-sm font-medium transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed ${styles} ${
        full ? "w-full" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs text-fg-dim">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-fg-dim">{hint}</span>}
    </label>
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  disabled,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 rounded-xl bg-bg-inset border border-border px-3.5 pr-14 font-mono tnum text-sm
                   outline-none focus:border-accent/60 transition-colors disabled:opacity-50
                   [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-fg-dim pointer-events-none">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: Array<{ value: T; label: ReactNode; disabled?: boolean; title?: string }>;
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-bg-inset border border-border gap-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          disabled={disabled || o.disabled}
          onClick={() => onChange(o.value)}
          className={`px-3.5 h-8 rounded-lg text-xs font-medium transition-all disabled:opacity-35 disabled:cursor-not-allowed ${
            value === o.value
              ? "bg-accent/15 text-accent shadow-[0_0_0_1px_#a5a8f033]"
              : "text-fg-dim hover:text-fg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

export function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-fg-dim">{children}</p>;
}

export function ErrorNote({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/[0.07] px-3 py-2">
      <p className="text-sm text-danger">{children}</p>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-danger/60 hover:text-danger text-xs shrink-0">
          dismiss
        </button>
      )}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs text-fg-dim leading-relaxed border-l-2 border-border pl-3">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatAmount(n: bigint): string {
  return n.toLocaleString("en-US");
}

export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s <= 0) return "now";
  const days = Math.floor(s / 86400);
  if (days >= 1) return `${days}d`;
  const hours = Math.floor(s / 3600);
  if (hours >= 1) return `${hours}h`;
  return `${Math.max(1, Math.floor(s / 60))}m`;
}

export function formatDate(unixSeconds: bigint): string {
  return new Date(Number(unixSeconds) * 1000).toISOString().replace("T", " ").slice(0, 16);
}

export function shortAddress(addr: string, chars = 6): string {
  return addr.length > chars * 2 + 2 ? `${addr.slice(0, chars + 2)}…${addr.slice(-chars)}` : addr;
}
