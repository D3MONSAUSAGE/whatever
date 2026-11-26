import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const an = readFileSync("components/analytics-screen.tsx", "utf8");
const nc = readFileSync("components/notifications.tsx", "utf8");
const css = readFileSync("app/peek.css", "utf8");

describe("Peek PR10 insights (flag only)", () => {
  it("keeps the analytics bar colours and only adds a below-95% hook", () => {
    expect(an).toContain('d.uptimePct >= 95 ? "bg-live-strong" : d.uptimePct >= 50 ? "bg-amber-400" : "bg-danger"');
    expect(an).toContain('data-low={d.uptimePct !== null && d.uptimePct < 95 ? "1" : undefined}');
    expect(css).toMatch(/\.peek \.an-root \.an-bar\[data-low\] \{ background: var\(--pk-warning\); \}/);
  });
  it("keeps analytics data sources unchanged", () => {
    for (const url of ["/api/analytics/uptime?days=", "/api/analytics/activity?limit=20"]) expect(an).toContain(url);
  });
  it("uses Peek moods in notification rows only when the flag is on", () => {
    expect(nc).toContain("const peek = usePeekWeb();");
    expect(nc).toContain('peek ? <Peek mood={text.tone === "ok" ? "happy" : "asleep"} size={28} />');
    expect(nc).toContain('text.tone === "ok" ? <IconCheck /> : <IconTvOff />');
  });
});
