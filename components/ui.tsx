"use client";

import React from "react";
import type { NodeState } from "@/lib/types";
import { cn } from "@/lib/format";

/* ---------- Buttons ---------- */

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "outline" | "danger" | "subtle";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "px-3 py-1.5 text-[13px]",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "lg" && "px-6 py-3 text-[15px]",
        variant === "primary" &&
          "bg-mint text-graphite hover:bg-[#6ff0cf] disabled:hover:bg-mint",
        variant === "ghost" && "text-muted hover:bg-elevated-2 hover:text-ink",
        variant === "outline" && "border border-line text-ink hover:border-mint hover:text-mint",
        variant === "subtle" && "bg-elevated-2 text-ink hover:bg-line",
        variant === "danger" &&
          "border border-error/50 text-error hover:bg-error/10",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------- Node state pill (never color-only: icon + text) ---------- */

const STATE_META: Record<NodeState, { label: string; glyph: string; cls: string }> = {
  locked: { label: "Locked", glyph: "◆", cls: "border-line text-muted" },
  available: { label: "Available", glyph: "○", cls: "border-mint/50 text-mint" },
  recommended: { label: "Recommended", glyph: "➤", cls: "border-mint bg-mint/10 text-mint" },
  "in-progress": { label: "In progress", glyph: "◐", cls: "border-warning/60 text-warning" },
  completed: { label: "Completed", glyph: "●", cls: "border-success/50 text-success" },
  mastered: { label: "Mastered", glyph: "★", cls: "border-success bg-success/10 text-success" },
  "needs-practice": { label: "Needs practice", glyph: "↻", cls: "border-warning/60 bg-warning/10 text-warning" },
  optional: { label: "Optional", glyph: "◇", cls: "border-line text-muted" },
};

export function StatePill({ state, className }: { state: NodeState; className?: string }) {
  const meta = STATE_META[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        meta.cls,
        className
      )}
    >
      <span aria-hidden="true">{meta.glyph}</span>
      {meta.label}
    </span>
  );
}

/* ---------- Cards, meters, misc ---------- */

export function Card({
  children,
  className,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("rounded-xl border border-line bg-elevated", className)} {...rest}>
      {children}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max === 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  return (
    <div className={className}>
      {label && (
        <div className="mb-1 flex items-center justify-between text-xs text-muted">
          <span>{label}</span>
          <span aria-hidden="true">
            {value}/{max}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label ?? "Progress"}
        className="h-2 overflow-hidden rounded-full bg-[#0c1218]"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-mint-dim to-mint transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DifficultyDots({ level }: { level: number }) {
  return (
    <span
      className="inline-flex items-center gap-1"
      role="img"
      aria-label={`Difficulty ${level} of 5`}
    >
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i <= level ? "bg-warning" : "bg-line"
          )}
        />
      ))}
    </span>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-elevated/50 px-6 py-10 text-center">
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEffectClose(onClose);
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-elevated p-6 shadow-2xl nice-scroll animate-toast-in">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

function useEffectClose(onClose: () => void) {
  React.useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
}
