/** Only same-site dashboard paths, including a query such as ?screen=. */
export function safeDashboardNext(raw: string) {
  return /^\/dashboard(\/[A-Za-z0-9/_-]*)?(\?[^#]*)?$/.test(raw) ? raw : "/dashboard";
}
