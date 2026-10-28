import type { SupabaseClient } from "@supabase/supabase-js";

const TEST_EMAIL = /^pantalla-(e2e|rls)-[0-9a-f-]{36}@mailinator\.com$/i;
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isDisposableTestEmail(email: string) {
  return TEST_EMAIL.test(email);
}

/**
 * Deletes storage objects and media rows for accounts these tests created,
 * then deletes those auth users. Paths have to live under that account id.
 */
export async function removeCreatedTestUsers(admin: SupabaseClient, userIds: string[]) {
  const seen = new Set<string>();
  for (const userId of userIds) {
    if (!userId || seen.has(userId)) continue;
    seen.add(userId);
    const looked = await admin.auth.admin.getUserById(userId);
    const email = looked.data.user?.email || "";
    if (looked.error || !isDisposableTestEmail(email)) continue;
    await removeAccountStorage(admin, userId);
    await admin.auth.admin.deleteUser(userId);
  }
}

export async function removeCreatedTestEmails(admin: SupabaseClient, emails: string[]) {
  const wanted = new Set(emails.filter(isDisposableTestEmail));
  if (!wanted.size) return;
  const ids: string[] = [];
  for (let page = 1; page <= 20 && ids.length < wanted.size; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data.users?.length) break;
    for (const user of data.users) {
      if (user.email && wanted.has(user.email)) ids.push(user.id);
    }
    if (data.users.length < 200) break;
  }
  await removeCreatedTestUsers(admin, ids);
}

async function removeAccountStorage(admin: SupabaseClient, userId: string) {
  const { data: account } = await admin.from("accounts").select("id, owner_user_id").eq("owner_user_id", userId).maybeSingle();
  if (!account || account.owner_user_id !== userId) return;
  const accountId = String(account.id);
  if (!ACCOUNT_ID.test(accountId)) return;

  const paths = new Set<string>();
  const rich = await admin.from("media").select("storage_path, thumbnail_path").eq("account_id", accountId);
  const rows = rich.error
    ? (await admin.from("media").select("storage_path").eq("account_id", accountId)).data
    : rich.data;
  for (const row of rows ?? []) {
    addPath(paths, accountId, row.storage_path);
    addPath(paths, accountId, (row as { thumbnail_path?: string | null }).thumbnail_path);
  }

  for (let offset = 0; offset < 1000; offset += 100) {
    const listed = await admin.storage.from("media").list(accountId, { limit: 100, offset });
    if (listed.error || !listed.data?.length) break;
    for (const entry of listed.data) {
      if (!entry?.name || entry.name.includes("/") || entry.id === null) continue;
      addPath(paths, accountId, `${accountId}/${entry.name}`);
    }
    if (listed.data.length < 100) break;
  }

  const all = [...paths];
  for (let i = 0; i < all.length; i += 50) {
    await admin.storage.from("media").remove(all.slice(i, i + 50));
  }
  await admin.from("media").delete().eq("account_id", accountId);
}

function addPath(paths: Set<string>, accountId: string, value: unknown) {
  if (typeof value !== "string" || value.includes("..")) return;
  if (!value.startsWith(`${accountId}/`)) return;
  paths.add(value);
}
