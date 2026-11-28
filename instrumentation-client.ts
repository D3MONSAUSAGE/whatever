import { analytics } from "@heycatch/sdk";
import { heycatchInitConfig } from "@/lib/heycatch";

// HeyCatch analytics: Next runs this file on the client before hydration on every page, so one `init` covers the
// marketing site, sign-in and the web app (guide: Next.js >= 15.3). Rules for what is sent live in lib/heycatch.ts.
analytics.init(heycatchInitConfig());
