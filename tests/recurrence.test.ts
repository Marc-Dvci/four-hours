import { describe, it, expect } from "vitest";
import { recurring } from "../src/core/recurrence";
import { makeIncident } from "../src/demo/bank";
describe("recurring incidents", () => {
  const a = () =>
    makeIncident(
      {
        criticalFunction: true,
        memberStates: ["FR", "DE"],
        economicImpact: 60000,
      },
      { id: "FH-2" },
    );
  const b = () =>
    makeIncident(
      {
        criticalFunction: true,
        memberStates: ["FR", "DE"],
        economicImpact: 60000,
      },
      {
        id: "FH-1",
        occurredAt: "2026-08-01T08:00:00Z",
        awarenessAt: "2026-08-01T09:00:00Z",
      },
    );
  it("combines disjoint costs and geographical impact", () =>
    expect(recurring(a(), [b()]).assessment?.verdict).toBe("MAJOR"));
  it("deduplicates repeated incident IDs", () =>
    expect(recurring(a(), [a(), b(), b()]).incidentIds).toHaveLength(2));
  it("combines the same root cause across services", () => {
    const x = b();
    x.serviceId = "another";
    expect(recurring(a(), [x]).assessment?.verdict).toBe("MAJOR");
  });
  it("requires the same apparent root cause", () => {
    const x = b();
    x.rootCause = "Another cause";
    expect(recurring(a(), [x]).assessment).toBeNull();
  });
  it("ignores incidents older than six calendar months", () => {
    const x = b();
    x.occurredAt = "2026-03-01T08:00:00Z";
    x.awarenessAt = "2026-03-01T09:00:00Z";
    expect(recurring(a(), [x]).assessment).toBeNull();
  });
  it("never sums overlapping costs", () => {
    const x = b();
    x.occurredAt = a().occurredAt;
    x.awarenessAt = a().awarenessAt;
    expect(
      recurring(a(), [x]).aggregated?.facts.economicImpact.value,
    ).toBeNull();
  });
  it("never adds people without deduplication", () =>
    expect(
      recurring(a(), [b()]).aggregated?.facts.affectedClients.value,
    ).toBeNull());
  it("does not treat the time between incidents as downtime", () =>
    expect(
      recurring(a(), [b()]).aggregated?.facts.downtimeMinutes.value,
    ).toBeNull());
  it("honours the exemption", () => {
    const x = a();
    x.recurrenceExempt = true;
    expect(recurring(x, [b()]).assessment).toBeNull();
  });
  it("does not infer a root cause from unknown", () => {
    const x = a();
    x.rootCause = "Unknown";
    expect(recurring(x, [b()]).assessment).toBeNull();
  });
});
