import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "media";
let client: SupabaseClient | null = null;
let testClient: SupabaseClient | null = null;

/** Test hook. Refuses to run outside the test runner. */
export function setTestDb(next: SupabaseClient | null) {
  if (process.env.NODE_ENV !== "test" && process.env.VITEST !== "true") {
    throw new Error("setTestDb is only available in tests");
  }
  testClient = next;
  client = null;
}

/** Service-role client. Server code only. */
export function db(): SupabaseClient {
  if (testClient) return testClient;
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase env vars are missing");
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
