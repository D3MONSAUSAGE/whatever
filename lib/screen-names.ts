/** Compare screen names ignoring case and extra spaces. "Front  counter" matches "front counter". */
export function screenNameKey(name: string) {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Next free "Name 2", "Name 3", … A trailing number on the typed name is not part of the base. */
export function suggestScreenName(name: string, existing: string[]) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const typedBase = trimmed.replace(/\s+\d+$/, "") || trimmed;
  const sample = existing.find((item) => screenNameKey(item).replace(/\s+\d+$/, "") === screenNameKey(typedBase));
  const base = (sample ? sample.trim().replace(/\s+/g, " ").replace(/\s+\d+$/, "") : typedBase) || trimmed;
  const keys = new Set(existing.map(screenNameKey));
  if (!keys.has(screenNameKey(base))) return base;
  for (let n = 2; n < 200; n++) {
    const candidate = `${base} ${n}`;
    if (!keys.has(screenNameKey(candidate))) return candidate;
  }
  return `${base} 2`;
}

export function screenNameWarning(name: string, existing: string[]) {
  const key = screenNameKey(name);
  if (!key) return null;
  const match = existing.find((item) => screenNameKey(item) === key);
  if (!match) return null;
  const suggestedName = suggestScreenName(name, existing);
  return {
    nameWarning: `Another screen is already named “${match}”. You can still use this name. A free name would be “${suggestedName}”.`,
    suggestedName,
  };
}
