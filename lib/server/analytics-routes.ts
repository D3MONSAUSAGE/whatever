import { fail } from "./http";
import { ANALYTICS_UNAVAILABLE } from "./analytics";

export function analyticsFail(e: { missing: boolean }) {
  return e.missing ? fail(ANALYTICS_UNAVAILABLE, 503) : fail("Couldn't load analytics. Try again.", 500);
}
