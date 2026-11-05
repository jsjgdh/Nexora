/* Motion, hand-rolled.
 *
 * There is no animation library in this build, and that is a decision rather
 * than a gap. The one effect the front door needs — an element arriving once,
 * or a group arriving in order — is a few lines of IntersectionObserver, and
 * it has to answer to the same two constraints the rest of the product does:
 *
 *   1. Nothing may move for a learner who asked for less motion. That is why
 *      every primitive here funnels through `reduced()` and why the reduced
 *      answer is always "the settled state, immediately" rather than "off".
 *   2. Nothing may animate off-screen. The observer disconnects the moment it
 *      has fired, so a reveal costs one observation and then nothing.
 *
 * The functions are deliberate plain actions (Svelte `use:`), not components,
 * so a heading, a plate and a receipt all get the same behaviour by handing
 * over the same element. */

/** True when the visitor has asked the operating system for less motion. */
export function reduced(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * The safety net for the reveal.
 *
 * The reveal is a CSS transition, and a transition that never finishes leaves
 * the heading where it started — which on this site would hide the argument
 * itself. A browser that has stopped ticking its transitions (a backgrounded
 * tab on a throttled clock, a compositor that gave up, an embedded webview)
 * is a real failure mode, not a hypothetical one, so once the element has
 * been marked as shown a timer settles it outright: the transition is
 * switched off and the final state is written as a plain value.
 *
 * A browser that ticks its transitions never reaches this path, because the
 * transition has already finished by the time the timer fires. The timer is
 * deliberately longer than the longest transition in the build.
 */
function settle(node: HTMLElement): void {
  window.setTimeout(() => {
    const targets = new Set<HTMLElement>();
    if (node.classList.contains("fade-up") || node.classList.contains("reveal-item")) {
      targets.add(node);
    }
    for (const el of node.querySelectorAll<HTMLElement>(
      ".fade-up, .reveal-item, .line-mask > span"
    )) {
      targets.add(el);
    }
    for (const target of targets) {
      target.style.transition = "none";
      target.style.transform = "translateY(0)";
      target.style.opacity = "1";
    }
  }, 1400);
}

/**
 * Reveal once, when the element is far enough into the viewport.
 *
 * Sets `data-shown="true"` rather than adding an animation, so the visual
 * work stays in CSS and the reduced-motion override in app.css can neutralise
 * every reveal in one rule. Reduced motion shows immediately.
 */
export function inView(
  node: HTMLElement,
  params: { threshold?: number; onShown?: () => void } = {}
): { destroy: () => void } {
  if (reduced() || typeof IntersectionObserver === "undefined") {
    // The settled state, with no entrance callback: a component that plays a
    // sequence on entry must not be asked to play it for someone who asked
    // for less motion.
    node.dataset.shown = "true";
    return { destroy: () => {} };
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        node.dataset.shown = "true";
        settle(node);
        io.disconnect();
        params.onShown?.();
      }
    },
    { threshold: params.threshold ?? 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

/**
 * Reveal a group with a stagger: the container marks each child's
 * `data-shown`, in order, once.
 */
export function inViewStagger(
  node: HTMLElement,
  params: { step?: number } = {}
): { destroy: () => void } {
  const step = params.step ?? 70;
  const items = [...node.querySelectorAll<HTMLElement>("[data-stagger-item]")];
  if (reduced() || typeof IntersectionObserver === "undefined") {
    items.forEach((item) => (item.dataset.shown = "true"));
    return { destroy: () => {} };
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        items.forEach((item, i) => {
          window.setTimeout(() => {
            item.dataset.shown = "true";
            settle(item);
          }, i * step);
        });
        io.disconnect();
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}
