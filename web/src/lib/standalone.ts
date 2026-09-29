/**
 * True when running as an installed home-screen app (CLAUDE.md H6) rather
 * than in a browser tab. iOS Safari reports it via `navigator.standalone`;
 * everything else via the display-mode media query from the web manifest.
 */
export function isStandalone(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
}

/** iPhone/iPad, including iPadOS reporting itself as a Mac with touch. */
export function isIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}
