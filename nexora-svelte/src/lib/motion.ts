/* Motion, hand-rolled.
 *
 * There is no animation library in this build, and that is a decision rather
 * than a gap. Every effect the front door needs — an element arriving once,
 * a value counting up, a section scrubbed against the scroll, a rail that
 * reports where you are — is a few lines of IntersectionObserver and
 * requestAnimationFrame, and every one of them has to answer to the same two
 * constraints the rest of the product does:
 *
 *   1. Nothing may move for a learner who asked for less motion. That is why
 *      every primitive here funnels through `reduced()` and why the reduced
 *      answer is always "the settled state, immediately" rather than "off".
 *   2. Nothing may animate off-screen. Observers disconnect after they fire;
 *      the scrubber cancels its frame when the element leaves the viewport.
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

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

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
          window.setTimeout(() => (item.dataset.shown = "true"), i * step);
        });
        io.disconnect();
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -6% 0px" }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

/**
 * Scrub a value against the scroll: `0` when the element's top reaches the
 * bottom of the viewport, `1` when its bottom leaves the top. The callback
 * receives the clamped progress and is never called more than once a frame,
 * and never at all for a reduced-motion visitor — they get a single call at
 * the settled value for the element's current position, and then no further
 * work as they scroll.
 */
export function scrub(
  node: HTMLElement,
  params: { onProgress: (p: number) => void }
): { destroy: () => void } {
  const measure = (): number => {
    const rect = node.getBoundingClientRect();
    const travel = window.innerHeight + rect.height;
    return travel <= 0 ? 0 : clamp01((window.innerHeight - rect.top) / travel);
  };

  if (reduced()) {
    params.onProgress(measure());
    return { destroy: () => {} };
  }

  let queued = false;
  let visible = false;
  const frame = (): void => {
    queued = false;
    params.onProgress(measure());
  };
  const request = (): void => {
    if (queued || !visible) return;
    queued = true;
    requestAnimationFrame(frame);
  };

  let io: IntersectionObserver | null = null;
  if (typeof IntersectionObserver !== "undefined") {
    io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible = entry.isIntersecting;
        request();
      },
      { threshold: 0 }
    );
    io.observe(node);
  } else {
    visible = true;
  }

  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  request();

  return {
    destroy: () => {
      io?.disconnect();
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
    },
  };
}

/**
 * Count a number up from zero when it is first seen.
 *
 * The element's existing text is the target, so the markup stays readable
 * without JavaScript and a crawler or a reduced-motion visitor reads the real
 * value rather than a zero. The final value is written back exactly, so a
 * value like `012` or `1,204` keeps its shape.
 */
export function ticker(
  node: HTMLElement,
  params: { duration?: number } = {}
): { destroy: () => void } {
  const target = node.textContent ?? "";
  const numeric = Number(target.replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || reduced() || typeof IntersectionObserver === "undefined") {
    return { destroy: () => {} };
  }

  const decimals = target.includes(".") ? (target.split(".")[1]?.length ?? 0) : 0;
  const duration = params.duration ?? 900;

  const render = (value: number): void => {
    node.textContent = value.toFixed(decimals);
  };

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.disconnect();
        const start = performance.now();
        const step = (now: number): void => {
          const t = clamp01((now - start) / duration);
          // Ease-out, the same curve arrivals use, so a count and a fade
          // finish together rather than racing.
          const eased = 1 - Math.pow(1 - t, 3);
          render(numeric * eased);
          if (t < 1) requestAnimationFrame(step);
          else node.textContent = target;
        };
        requestAnimationFrame(step);
      }
    },
    { threshold: 0.4 }
  );
  io.observe(node);
  return { destroy: () => io.disconnect() };
}

/**
 * Report page scroll as a CSS custom property on the node, for the rail.
 * One listener, passive, rAF-throttled, and no value at all under reduced
 * motion (the rail renders without a marker rather than sliding one).
 */
export function scrollProgress(
  node: HTMLElement
): { destroy: () => void } {
  const isReduced = reduced();
  let queued = false;
  const frame = (): void => {
    queued = false;
    const doc = document.documentElement;
    const travel = doc.scrollHeight - window.innerHeight;
    const p = travel <= 0 ? 0 : clamp01(window.scrollY / travel);
    node.style.setProperty("--scroll-progress", p.toFixed(4));
  };
  const request = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(frame);
  };
  if (isReduced) {
    node.style.setProperty("--scroll-progress", "0");
    return { destroy: () => {} };
  }
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request, { passive: true });
  request();
  return {
    destroy: () => {
      window.removeEventListener("scroll", request);
      window.removeEventListener("resize", request);
    },
  };
}

/**
 * A magnet: the element leans a few pixels toward a nearby pointer. Purely
 * decorative and purely additive — the keyboard target is identical, the
 * click target is unchanged, and a touch or reduced-motion visitor gets the
 * unshifted element.
 */
export function magnet(
  node: HTMLElement,
  params: { strength?: number } = {}
): { destroy: () => void } {
  if (
    reduced() ||
    typeof window.matchMedia !== "function" ||
    !window.matchMedia("(pointer: fine)").matches
  ) {
    return { destroy: () => {} };
  }
  const strength = params.strength ?? 5;
  let queued = false;
  let x = 0;
  let y = 0;
  const frame = (): void => {
    queued = false;
    node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
  };
  const move = (event: PointerEvent): void => {
    const rect = node.getBoundingClientRect();
    const dx = (event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2 || 1);
    const dy = (event.clientY - (rect.top + rect.height / 2)) / (rect.height / 2 || 1);
    x = Math.max(-1, Math.min(1, dx)) * strength;
    y = Math.max(-1, Math.min(1, dy)) * strength;
    if (!queued) {
      queued = true;
      requestAnimationFrame(frame);
    }
  };
  const reset = (): void => {
    x = 0;
    y = 0;
    if (!queued) {
      queued = true;
      requestAnimationFrame(frame);
    }
  };
  node.addEventListener("pointermove", move, { passive: true });
  node.addEventListener("pointerleave", reset);
  return {
    destroy: () => {
      node.removeEventListener("pointermove", move);
      node.removeEventListener("pointerleave", reset);
    },
  };
}

