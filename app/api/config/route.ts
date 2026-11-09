import { json } from "@/lib/server/http";
import { publicUrls } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public pairing and player addresses. No account data and no secrets. */
export async function GET() {
  return json(publicUrls());
}
