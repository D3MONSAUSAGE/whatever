export type ScreenActionId = "upload" | "change" | "create" | "playlist" | "schedule";

export function screenActionLabel(id: ScreenActionId) {
  if (id === "upload") return "Add media";
  if (id === "change") return "Change content";
  if (id === "create") return "Create";
  if (id === "playlist") return "Edit playlist";
  return "Schedule";
}

/** Change content is the primary action. The others stay secondary. An open panel stays pressed. */
export function screenActionClass(id: ScreenActionId, open: boolean) {
  if (id === "change") return open ? "btn btn-primary min-h-11 ring-2 ring-offset-2 ring-primary" : "btn btn-primary min-h-11";
  return open ? "btn btn-pressed min-h-11" : "btn btn-quiet min-h-11";
}
