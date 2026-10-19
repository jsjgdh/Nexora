/* The action vocabulary.
 *
 * There is exactly one shape of action on this site and it is defined here, so
 * a link and a button cannot drift into looking like two different products.
 * `ActionLink` (an anchor that goes somewhere) and `Button` (a control that
 * does something) both build their classes from this function; the only
 * difference between them is the element and the semantics.
 *
 * Every variant clears a 44px minimum height, because the one measurement a
 * design cannot argue with is a thumb. `sm` is narrower and set smaller — never
 * shorter. A 36px "small" action was here, and 36 is not a small button, it is
 * a button that a thumb misses.
 *
 * The transition names its properties instead of using `transition-colors`,
 * which also covers `outline-color` — and a focus ring that fades in is a ring
 * that is not there yet. Measured on the primary variant: the ring began at the
 * element's own text colour (the room's ground on an accent fill, which is
 * invisible) and only reached the accent after 200ms, so a keyboard user got no
 * indicator for the first sixth of a second. Focus is instant; only the hover
 * colours move.
 *
 * The press is real too: an action sinks by one pixel while it is held down,
 * so a click has a physical answer rather than only a colour change. */

export type ActionVariant = "primary" | "ghost" | "quiet" | "danger";
export type ActionSize = "sm" | "md";

export function actionClass(variant: ActionVariant = "primary", size: ActionSize = "md"): string {
  const base =
    "inline-flex items-center justify-center gap-3 border font-semibold whitespace-nowrap " +
    "transition-[color,background-color,border-color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] " +
    "active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
  const sizing = size === "sm" ? "min-h-[44px] px-3 text-[12.5px]" : "min-h-[44px] px-5 text-[13.5px]";
  const skin =
    variant === "primary"
      ? "border-accent bg-accent text-ground hover:bg-accent-bright hover:border-accent-bright"
      : variant === "ghost"
        ? "border-rule-strong text-ink hover:border-accent hover:text-accent"
        : variant === "danger"
          ? "border-removed text-removed hover:bg-raised"
          : "border-transparent text-muted hover:text-ink";
  return `${base} ${sizing} ${skin}`;
}
