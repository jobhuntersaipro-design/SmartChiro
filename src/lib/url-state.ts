/**
 * Keep filters/tabs/dates in the URL (shareable, survives reload) without a
 * navigation. router.replace() re-ran the page's server component — and its
 * database queries — on every filter click; the App Router keeps
 * useSearchParams in sync with history.replaceState, so this is enough.
 */
export function replaceUrl(url: string): void {
  window.history.replaceState(null, "", url);
}
