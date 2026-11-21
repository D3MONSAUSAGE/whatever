/** A library item can be published or assigned only when it is ready (or was never processed). */
export function isReadyMediaStatus(status: string | null | undefined): boolean {
  return status == null || status === "ready";
}

export function isProcessingMediaStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "processing";
}
