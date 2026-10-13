// JS-initiated scrolling ignores the CSS `scroll-behavior` overrides, so it must check the motion
// preferences itself: the OS setting (prefers-reduced-motion) and the in-app setting (html[data-motion]).
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return true;
  return document.documentElement.dataset.motion === "reduced" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function scrollToTop(): void {
  window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

export function scrollIntoViewRespectingMotion(el: Element | null | undefined): void {
  el?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
}
