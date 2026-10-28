import { createHash, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { jpeg } from "../helpers/bytes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const configured = url.startsWith("https://") && anon.length > 20 && service.length > 20 && !anon.includes("your-");

if (!configured) {
  console.log(
    "RLS tests skipped. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY (migration 0001_init.sql must already be applied).",
  );
}

describe.skipIf(!configured)("RLS account isolation", () => {
  let admin: SupabaseClient | null = null;
  const createdUsers: string[] = [];
  let storagePath = "";

  afterAll(async () => {
    if (!admin) return;
    if (storagePath) await admin.storage.from("media").remove([storagePath]);
    for (const id of createdUsers) await admin.auth.admin.deleteUser(id);
  });

  it("keeps accounts, tokens, storage, and server functions apart", async () => {
    admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const password = `${randomUUID()}Aa1!`;
    const emailA = `pantalla-rls-${randomUUID()}@example.com`;
    const emailB = `pantalla-rls-${randomUUID()}@example.com`;
    const userA = await makeUser(admin, emailA, password, createdUsers);
    const userB = await makeUser(admin, emailB, password, createdUsers);

    const accountA = await ensure(admin, userA.id, "Cafe A");
    const accountB = await ensure(admin, userB.id, "Cafe B");
    expect(accountA).not.toBe(accountB);

    const mediaId = randomUUID();
    storagePath = `${accountA}/${mediaId}.jpg`;
    const bytes = jpeg(8, 8);
    const { error: uploadError } = await admin.storage.from("media").upload(storagePath, bytes, { contentType: "image/jpeg" });
    expect(uploadError).toBeNull();
    const { error: mediaError } = await admin.from("media").insert({
      id: mediaId,
      account_id: accountA,
      file_name: "secret-menu.jpg",
      storage_path: storagePath,
      mime_type: "image/jpeg",
      size_bytes: bytes.length,
    });
    expect(mediaError).toBeNull();

    const token = `rls-${randomUUID()}-token-value`;
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: display, error: displayError } = await admin.from("displays").insert({
      account_id: accountA,
      name: "Counter",
      token_hash: tokenHash,
    }).select("id").single();
    expect(displayError).toBeNull();

    const { data: ownMedia } = await userA.client.from("media").select("id, file_name");
    expect(ownMedia?.map((row) => row.id)).toContain(mediaId);
    const { data: otherMedia } = await userB.client.from("media").select("id, file_name");
    expect(otherMedia ?? []).toEqual([]);
    const { data: otherAccounts } = await userB.client.from("accounts").select("id");
    expect(otherAccounts?.some((row) => row.id === accountA)).toBe(false);
    const { data: otherDisplays } = await userB.client.from("displays").select("id, name");
    expect(otherDisplays ?? []).toEqual([]);

    const tokenRead = await userA.client.from("displays").select("token_hash");
    expect(tokenRead.error).toBeTruthy();
    expect(JSON.stringify(tokenRead.data ?? [])).not.toContain(tokenHash);

    const adminSessions = await admin.from("pairing_sessions").select("id").limit(1);
    expect(adminSessions.error).toBeNull();
    const sessions = await userA.client.from("pairing_sessions").select("*");
    expect(sessions.data ?? []).toEqual([]);
    const adminLimits = await admin.from("rate_limits").select("key").limit(1);
    expect(adminLimits.error).toBeNull();
    const limits = await userB.client.from("rate_limits").select("*");
    expect(limits.data ?? []).toEqual([]);

    const renamed = await userA.client.from("media").update({ file_name: "hacked" }).eq("id", mediaId).select("id");
    expect(renamed.data ?? []).toEqual([]);
    const { data: still } = await admin.from("media").select("file_name").eq("id", mediaId).single();
    expect(still?.file_name).toBe("secret-menu.jpg");

    const inserted = await userB.client.from("media").insert({
      account_id: accountB,
      file_name: "nope.jpg",
      storage_path: `${accountB}/nope.jpg`,
      mime_type: "image/jpeg",
      size_bytes: 1,
    }).select("id");
    expect(inserted.data ?? []).toEqual([]);
    const { data: accountBMedia } = await admin.from("media").select("id").eq("account_id", accountB);
    expect(accountBMedia ?? []).toEqual([]);

    const download = await userA.client.storage.from("media").download(storagePath);
    expect(download.data).toBeNull();
    expect(download.error).toBeTruthy();
    const signed = await admin.storage.from("media").createSignedUrl(storagePath, 60);
    expect(signed.data?.signedUrl).toMatch(/^https?:\/\//);
    const fetched = await fetch(signed.data!.signedUrl);
    expect(fetched.ok).toBe(true);

    const state = await admin.rpc("player_state", { p_token_hash: tokenHash });
    expect(state.error).toBeNull();
    expect(state.data?.[0]?.display_id).toBe(display?.id);
    const { data: seen } = await admin.from("displays").select("last_seen_at").eq("id", display!.id).single();
    expect(seen?.last_seen_at).toBeTruthy();

    const blockedState = await userA.client.rpc("player_state", { p_token_hash: tokenHash });
    expect(blockedState.error).toBeTruthy();
    const blockedClaim = await userA.client.rpc("claim_pairing", { p_code_hash: "x", p_account_id: accountA, p_name: "X" });
    expect(blockedClaim.error).toBeTruthy();

    const key = `rls-test:${randomUUID()}`;
    const first = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 60, p_max: 1 });
    const second = await admin.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 60, p_max: 1 });
    expect(first.data).toBe(true);
    expect(second.data).toBe(false);
    await admin.from("rate_limits").delete().eq("key", key);
    const userHit = await userA.client.rpc("rate_limit_hit", { p_key: key, p_window_seconds: 60, p_max: 5 });
    expect(userHit.error).toBeTruthy();
  }, 90_000);
});

async function makeUser(admin: SupabaseClient, email: string, password: string, created: string[]) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message || "createUser failed");
  created.push(data.user.id);
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error || !signed.data.session) throw new Error(signed.error?.message || "sign-in failed");
  return { id: data.user.id, client };
}

async function ensure(admin: SupabaseClient, userId: string, name: string) {
  const { data, error } = await admin.rpc("ensure_account", { p_user_id: userId, p_name: name });
  if (error || !data) throw new Error(error?.message || "ensure_account failed");
  return data as string;
}
