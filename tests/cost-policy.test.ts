import { describe, it, expect } from "vitest";
import { requireBillingProtection } from "../src/core/cost-policy";
describe("zero-spend deployment boundary", () => {
  it("blocks deployment by default", () =>
    expect(() =>
      requireBillingProtection({ kind: "unverified" }, "2026-11-01T12:00:00Z"),
    ).toThrow("blocked"));
  it("rejects a claimed cap without provider evidence", () =>
    expect(() =>
      requireBillingProtection(
        { kind: "atlassian-hard-cap" },
        "2026-11-01T12:00:00Z",
      ),
    ).toThrow("provider evidence"));
  it("rejects expired protection", () =>
    expect(() =>
      requireBillingProtection(
        {
          kind: "billing-exempt-sandbox",
          evidenceUrl: "https://developer.atlassian.com/",
          verifiedAt: "2026-10-01T00:00:00Z",
          expiresAt: "2026-10-31T00:00:00Z",
        },
        "2026-11-01T12:00:00Z",
      ),
    ).toThrow("expired"));
  it("permits an explicitly verified exempt destination", () =>
    expect(() =>
      requireBillingProtection(
        {
          kind: "billing-exempt-sandbox",
          evidenceUrl: "https://developer.atlassian.com/",
          verifiedAt: "2026-11-01T00:00:00Z",
          expiresAt: "2026-11-02T00:00:00Z",
        },
        "2026-11-01T12:00:00Z",
      ),
    ).not.toThrow());
});
