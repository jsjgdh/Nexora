/* The action vocabulary.
 *
 * One shape for every action: a cut chip, a 48px target, sentence case, a
 * petrol fill for the one thing a page wants done, and a quiet rule for
 * everything else. `ActionLink` (a link that goes somewhere) and `Button` (a
 * control that does something) build their classes here, so the two cannot
 * drift.
 *
 * Petrol is the action hue. Course colours decorate a mark and its tag; they
 * never paint a button. `inverse` exists for the dark band, where the action
 * sits on the petrol plate and has to turn to paper. `danger` is the
 * failed-check ink, used only by a destructive control.
 *
 * Focus is instant; hover and lift are short and eased. */

export type ActionVariant = "primary" | "ghost" | "quiet" | "danger" | "inverse";
export type ActionSize = "sm" | "md" | "lg";

export function actionClass(variant: ActionVariant = "primary", size: ActionSize = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-2.5 rounded-chip border font-semibold whitespace-nowrap " +
    "transition-[color,background-color,border-color,transform,box-shadow] duration-200 " +
    "ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5 active:translate-y-0 " +
    "disabled:cursor-not-allowed disabled:opacity-50";
  const sizing =
    size === "sm"
      ? "min-h-[44px] px-4 text-[13px]"
      : size === "lg"
        ? "min-h-[52px] px-7 text-[15px]"
        : "min-h-[48px] px-6 text-[14px]";
  const skin =
    variant === "primary"
      ? "border-accent bg-accent text-on-accent shadow-[var(--shadow-cta)] hover:border-accent-strong hover:bg-accent-strong"
      : variant === "ghost"
        ? "border-rule-strong bg-panel text-ink hover:border-ink/30 hover:bg-raised"
        : variant === "danger"
          ? "border-fail bg-transparent text-fail hover:bg-fail/10"
          : variant === "inverse"
            ? "border-on-accent bg-on-accent text-accent-strong hover:border-accent hover:bg-transparent hover:text-on-accent"
            : "border-transparent bg-transparent text-muted hover:text-ink";
  return `${base} ${sizing} ${skin}`;
}
