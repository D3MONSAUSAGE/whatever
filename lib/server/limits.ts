/** Pairing-code lifetime and fixed-window rate limits. Shared with tests. */
export const PAIRING_TTL_SECONDS = 600;

/** New pairing codes requested by a TV, per IP. */
export const PAIR_CREATE_WINDOW_SECONDS = 3600;
export const PAIR_CREATE_MAX_PER_IP = 30;

/** Admin attempts to claim a code (wrong or right), per account and per IP. */
export const PAIR_CLAIM_WINDOW_SECONDS = 900;
export const PAIR_CLAIM_MAX_PER_USER = 10;
export const PAIR_CLAIM_MAX_PER_IP = 30;

/** A display is online if the player polled within this window. */
export const ONLINE_MS = 60_000;

/** Heartbeat writes are skipped when last_seen is newer than this. */
export const HEARTBEAT_SECONDS = 30;

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

export const PLAYLIST_MAX_ITEMS = 40;
export const PLAYLIST_MIN_DURATION_MS = 1000;
export const PLAYLIST_MAX_DURATION_MS = 600_000;
export const PLAYLIST_DEFAULT_DURATION_MS = 10_000;

/** Long-edge cap. Blocks decompression bombs without a native image library. */
export const MAX_EDGE = 7680;
export const MAX_PIXELS = 7680 * 4320;
