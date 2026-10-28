export const PLAYLISTS_UNAVAILABLE =
  "Playlists aren't available yet. Apply migration 0002_playlists.sql, then reload.";

export const VIDEO_UNAVAILABLE =
  "Video isn't available yet. Apply migration 0003_video.sql, then reload.";

type DbError = { code?: string; message?: string } | null | undefined;

/** True when this database has not had 0002_playlists.sql applied yet. */
export function isMissingSchema(error: DbError) {
  if (!error) return false;
  const code = error.code || "";
  if (code === "42P01" || code === "42703" || code === "42883" || code === "PGRST202" || code === "PGRST204" || code === "PGRST205") {
    return true;
  }
  const message = (error.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("could not find the function") ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}
