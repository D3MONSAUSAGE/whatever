/**
 * U2-05: rename a file in Media. Only the display name (media.file_name) changes;
 * the storage path, playlists and screens are untouched. The original extension is kept,
 * because the logo and photo pickers list images by extension.
 */
export const MEDIA_NAME_MAX = 200;
const EXTENSION = /\.[A-Za-z0-9]{1,5}$/;

function stripControls(value: string) {
  let out = "";
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 32 && code !== 127) out += value[i];
  }
  return out;
}

export type MediaRename = { ok: true; name: string } | { ok: false; error: string };

export function mediaRename(original: string, input: unknown): MediaRename {
  if (typeof input !== "string") return { ok: false, error: "Give the file a name." };
  const name = stripControls(input).trim();
  const ext = EXTENSION.exec(original)?.[0] ?? "";
  if (!ext) return name ? { ok: true, name: name.slice(0, MEDIA_NAME_MAX) } : { ok: false, error: "Give the file a name." };
  const base = (name.toLowerCase().endsWith(ext.toLowerCase()) ? name.slice(0, -ext.length) : name).trim();
  if (!base) return { ok: false, error: "Give the file a name." };
  return { ok: true, name: `${base.slice(0, MEDIA_NAME_MAX - ext.length).trimEnd()}${ext}` };
}
