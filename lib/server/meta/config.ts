/** Meta tracking flags. Both default OFF; anything other than the exact string "true" is off. */
export type MetaEnv = Record<string, string | undefined>;

export function metaConfig(env: MetaEnv = process.env) {
  const pixelEnabled = env.META_PIXEL_ENABLED === "true" && !!env.META_PIXEL_ID;
  const capiEnabled = env.META_CAPI_ENABLED === "true" && !!env.META_DATASET_ID && !!env.META_CAPI_TOKEN;
  return {
    pixelEnabled,
    pixelId: pixelEnabled ? env.META_PIXEL_ID! : null,
    capiEnabled,
    datasetId: env.META_DATASET_ID ?? null,
    token: env.META_CAPI_TOKEN ?? null,
    // Tests point this at a mock server. Default is Meta's Graph API (never called in dev: no dataset/token exists).
    endpoint: (env.META_CAPI_ENDPOINT || "https://graph.facebook.com/v21.0").replace(/\/$/, ""),
    testEventCode: env.META_TEST_EVENT_CODE || null,
    consentVersion: "2026-11-v1",
  };
}
export type MetaConfig = ReturnType<typeof metaConfig>;
