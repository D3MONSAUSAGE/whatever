import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { stopChargingBeforePurge, type RetrievedSubscription, type SubscriptionStopper } from "@/lib/server/account-deletion";

const customer = "cus_mockaccount";
const subscription = "sub_mockaccount";

function stopper(found: RetrievedSubscription | "missing", after?: RetrievedSubscription): { api: SubscriptionStopper; canceled: string[] } {
  const canceled: string[] = [];
  return {
    canceled,
    api: {
      async retrieve(id) {
        expect(id).toBe(subscription);
        return found;
      },
      async cancel(id) {
        canceled.push(id);
        if (!after) throw new Error("should not cancel");
        return after;
      },
    },
  };
}

const active: RetrievedSubscription = { id: subscription, customerId: customer, status: "active", livemode: false };

describe("stop charging before an account purge", () => {
  it("does not call Stripe when the account has no subscription", async () => {
    const fake = stopper(active);
    await expect(stopChargingBeforePurge({ customerId: null, subscriptionId: null }, fake.api, false)).resolves.toBe("none");
    expect(fake.canceled).toEqual([]);
  });

  it("cancels only that account's live-mode-matching subscription", async () => {
    const fake = stopper(active, { ...active, status: "canceled" });
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, fake.api, false)).resolves.toBe("canceled");
    expect(fake.canceled).toEqual([subscription]);
  });

  it("retries without a second cancel after the subscription is already stopped", async () => {
    const fake = stopper({ ...active, status: "canceled" });
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, fake.api, false)).resolves.toBe("already_stopped");
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, stopper({ ...active, status: "incomplete_expired" }).api, false)).resolves.toBe("already_stopped");
    expect(fake.canceled).toEqual([]);
  });

  it("does not cancel a different customer, mode, or missing subscription", async () => {
    const other = stopper({ ...active, customerId: "cus_otheraccount" });
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, other.api, false)).rejects.toThrow("billing_mismatch");
    const live = stopper({ ...active, livemode: true });
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, live.api, false)).rejects.toThrow("billing_mismatch");
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, stopper("missing").api, false)).rejects.toThrow("billing_missing");
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, null, false)).rejects.toThrow("billing_unavailable");
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: "not-a-subscription" }, stopper(active).api, false)).rejects.toThrow("billing_id");
    expect(other.canceled).toEqual([]);
    expect(live.canceled).toEqual([]);
  });

  it("refuses a cancel result that is not this subscription", async () => {
    const fake = stopper(active, { ...active, id: "sub_otheraccount", status: "canceled" });
    await expect(stopChargingBeforePurge({ customerId: customer, subscriptionId: subscription }, fake.api, false)).rejects.toThrow("billing_cancel");
    expect(fake.canceled).toEqual([subscription]);
  });

  it("stops billing before the purge and does not cancel during the waiting window", () => {
    const source = readFileSync("lib/server/account-deletion.ts", "utf8");
    const stop = source.indexOf("await stopChargingBeforePurge(");
    const files = source.indexOf("listAccountObjects(accountId)");
    const user = source.indexOf("auth.admin.deleteUser");
    expect(stop).toBeGreaterThan(0);
    expect(stop).toBeLessThan(files);
    expect(files).toBeLessThan(user);
    const job = source.slice(source.indexOf("export async function runDueDeletions"));
    expect(job).toMatch(/if \(opts\.dryRun\)/);
    expect(job.slice(0, job.indexOf("deleteAccountData"))).not.toContain("stopChargingBeforePurge");
    expect(source).not.toMatch(/STRIPE_LIVE_ENABLED\s*=\s*"1"|subscriptions\.cancel\([^\n]*sk_/);
  });
});
