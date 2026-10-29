/** Pairing-code lifetime and fixed-window rate limits. Shared with tests. */
export const PAIRING_TTL_SECONDS = 600;

/**
 * Authenticated write limits. Each route has its own counter, keyed by user id,
 * so one action cannot spend another's budget. The sentences match the 15 minute windows.
 */
export const UPLOAD_WINDOW_SECONDS = 15 * 60;
export const UPLOAD_MAX_PER_USER = 60;
export const UPLOAD_RATE_MESSAGE = "Too many uploads. Wait 15 minutes, then try again.";

export const PUBLISH_WINDOW_SECONDS = 15 * 60;
export const PUBLISH_MAX_PER_USER = 60;
export const PUBLISH_RATE_MESSAGE = "Too many publishes. Wait 15 minutes, then try again.";

/** Above the account caps (50 locations, 100 groups, 200 schedules), so filling an account does not 429. */
export const CREATE_WINDOW_SECONDS = 15 * 60;
export const CREATE_LOCATION_MAX_PER_USER = 80;
export const CREATE_GROUP_MAX_PER_USER = 150;
export const CREATE_SCHEDULE_MAX_PER_USER = 240;
export const CREATE_LOCATION_RATE_MESSAGE = "Too many locations. Wait 15 minutes, then try again.";
export const CREATE_GROUP_RATE_MESSAGE = "Too many screen groups. Wait 15 minutes, then try again.";
export const CREATE_SCHEDULE_RATE_MESSAGE = "Too many schedules. Wait 15 minutes, then try again.";

/** A storage object with no media row is an orphan once it is older than this. */
export const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

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
