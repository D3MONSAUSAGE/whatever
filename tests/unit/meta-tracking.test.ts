import { describe, expect, it, vi } from "vitest";
import { metaConfig } from "@/lib/server/meta/config";
import { buildEvent, cleanCustomData, postEvent, sha256, EVENTS } from "@/lib/server/meta/capi";
import { track, trackStartTrial, trackSubscribe } from "@/lib/server/meta/track";
import type { ConsentRow, MetaStore } from "@/lib/server/meta/store";

const ON = { META_CAPI_ENABLED: "true", META_DATASET_ID: "123", META_CAPI_TOKEN: "tok", META_CAPI_ENDPOINT: "http://mock.meta.test/v21.0", META_TEST_EVENT_CODE: "TEST123" };
const granted: ConsentRow = { visitor_id: "v", user_id: "u1", status: "granted", fbp: "fb.1.1700000000000.123", fbc: null, fbclid: null };

function memStore(consent: ConsentRow | null = granted) {
  const log = new Map<string, { status: string; attempts: number }>();
  const s: MetaStore & { log: typeof log } = {
    log,
    consentByVisitor: async () => consent, consentByUser: async () => consent,
    grant: async () => {}, touch: async () => {}, withdraw: async () => {},
    claim: async (e) => { const k = `${e.event_name}|${e.event_id}`; if (log.has(k)) return false; log.set(k, { status: "pending", attempts: 0 }); return true; },
    mark: async (n, id, p) => { log.set(`${n}|${id}`, p); },
  };
  return s;
}
const okFetch = () => vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;

describe("meta flags", () => {
  it("default off; only exact 'true' with ids enables", () => {
    expect(metaConfig({}).capiEnabled).toBe(false);
    expect(metaConfig({}).pixelEnabled).toBe(false);
    expect(metaConfig({ META_CAPI_ENABLED: "1", META_DATASET_ID: "1", META_CAPI_TOKEN: "t" }).capiEnabled).toBe(false);
    expect(metaConfig({ META_PIXEL_ENABLED: "true" }).pixelEnabled).toBe(false);
    expect(metaConfig(ON).capiEnabled).toBe(true);
  });
});

describe("event building", () => {
  it("hashes email, sets action_source per event, strips query from URL, allowlists custom data", () => {
    const e = buildEvent("ViewContent", "evt-123456", { email: " A@B.com ", ip: "1.2.3.4", ua: "UA" }, { content_name: "pricing", screen_name: "Bar TV", media: "x.mp4" }, 0, "https://x.app/pricing?fbclid=abc");
    expect((e.user_data as { em: string[] }).em).toEqual([sha256("a@b.com")]);
    expect(JSON.stringify(e)).not.toContain("A@B.com");
    expect(e.action_source).toBe("website");
    expect(e.event_source_url).toBe("https://x.app/pricing");
    expect(e.custom_data).toEqual({ content_name: "pricing" });
    expect(EVENTS.StartTrial).toBe("system_generated");
    expect(EVENTS.Subscribe).toBe("system_generated");
    expect(buildEvent("Subscribe", "sub:abcdefgh", {}, {}, 0, "https://x").event_source_url).toBeUndefined();
    expect(cleanCustomData({ value: 59, currency: "USD", plan: "multi", playlist: "lunch" })).toEqual({ value: 59, currency: "USD", plan: "multi" });
  });
});

describe("track gate", () => {
  it("sends nothing when flag off or consent missing/withdrawn", async () => {
    const f = okFetch();
    expect(await track({ name: "PageView", eventId: "e-12345678", consent: granted }, { cfg: metaConfig({}), store: memStore(), fetchImpl: f })).toBe("disabled");
    expect(await track({ name: "PageView", eventId: "e-12345678", consent: null }, { cfg: metaConfig(ON), store: memStore(), fetchImpl: f })).toBe("no_consent");
    expect(await track({ name: "PageView", eventId: "e-12345678", consent: { ...granted, status: "withdrawn" } }, { cfg: metaConfig(ON), store: memStore(), fetchImpl: f })).toBe("no_consent");
    expect(f).not.toHaveBeenCalled();
  });

  it("dedupes on event_name+event_id and posts to the mocked endpoint with test_event_code", async () => {
    const f = okFetch(); const store = memStore();
    const deps = { cfg: metaConfig(ON), store, fetchImpl: f };
    expect(await track({ name: "PageView", eventId: "e-12345678", consent: granted }, deps)).toBe("sent");
    expect(await track({ name: "PageView", eventId: "e-12345678", consent: granted }, deps)).toBe("duplicate");
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://mock.meta.test/v21.0/123/events");
    const body = JSON.parse(String(init.body));
    expect(body.test_event_code).toBe("TEST123");
    expect(body.data[0].user_data.fbp).toBe(granted.fbp);
  });

  it("webhook retries of Subscribe send once, with value and no Purchase", async () => {
    const f = okFetch(); const store = memStore();
    const deps = { cfg: metaConfig(ON), store, fetchImpl: f };
    const s = { userId: "u1", email: "o@x.com", stripeSubscriptionId: "sub_ABC123", plan: "business" as const };
    expect(await trackSubscribe(s, deps)).toBe("sent");
    expect(await trackSubscribe(s, deps)).toBe("duplicate");
    const ev = JSON.parse(String((f.mock.calls[0] as [string, RequestInit])[1].body)).data[0];
    expect(ev).toMatchObject({ event_name: "Subscribe", action_source: "system_generated", custom_data: { value: 39, currency: "USD", plan: "business" } });
    expect([...store.log.keys()].some((k) => k.startsWith("Purchase"))).toBe(false);
    expect(await trackStartTrial({ userId: "u1", email: "o@x.com" }, deps)).toBe("sent");
    expect(await trackStartTrial({ userId: "u1", email: "o@x.com" }, deps)).toBe("duplicate");
  });

  it("retries 5xx, gives up, logs failure without the token, never throws", async () => {
    const f = vi.fn(async () => new Response("", { status: 503 })) as unknown as typeof fetch;
    const log = vi.fn(); const store = memStore();
    const r = await track({ name: "StartTrial", eventId: "trial:u1", consent: granted }, { cfg: metaConfig(ON), store, fetchImpl: f, delays: [1, 1], log });
    expect(r).toBe("failed");
    expect(f).toHaveBeenCalledTimes(3);
    expect(store.log.get("StartTrial|trial:u1")).toMatchObject({ status: "failed", attempts: 3 });
    expect(String(log.mock.calls[0][0])).not.toContain("tok");
  });

  it("does not retry 4xx", async () => {
    const f = vi.fn(async () => new Response("", { status: 400 })) as unknown as typeof fetch;
    expect((await postEvent(metaConfig(ON), {}, f, [1, 1])).ok).toBe(false);
    expect(f).toHaveBeenCalledTimes(1);
  });
});
