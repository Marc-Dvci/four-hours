import { describe, it, expect } from "vitest";
import { contextSchema, updateContext } from "../src/core/context";
import { makeIncident } from "../src/demo/bank";
import { sign, type RecordState } from "../src/core/ledger";
import { clocks } from "../src/core/clocks";
const now = "2026-10-29T11:00:00Z";
const state = (): RecordState => ({
  incident: makeIncident({
    criticalFunction: true,
    affectedClients: 120,
    economicImpact: 200000,
  }),
  signature: null,
  receipts: [],
  revisions: [],
});
describe("incident context", () => {
  it("validates IANA timezones", () =>
    expect(() =>
      contextSchema.parse({ ...state().incident, timezone: "not-a-timezone" }),
    ).toThrow());
  it("updates root cause as a versioned event", async () => {
    const s = state();
    const next = await updateContext(
      s,
      { ...s.incident, rootCause: "Adapter memory leak" },
      "officer",
      now,
    );
    expect(next.incident.rootCause).toBe("Adapter memory leak");
    expect(next.revisions[0]!.action).toBe("incident.context.updated");
  });
  it("rejects future awareness", async () => {
    const s = state();
    await expect(
      updateContext(
        s,
        { ...s.incident, awarenessAt: "2099-01-01T10:00:00Z" },
        "officer",
        now,
      ),
    ).rejects.toThrow("future");
  });
  it("cannot extend the awareness cap by changing context", async () => {
    let s = await sign(
      state(),
      "officer",
      "Critical payment service and two thresholds met.",
      now,
    );
    const original = clocks(s.incident, s.signature, [], now)[0]!.dueAt;
    s = await updateContext(
      s,
      { ...s.incident, awarenessAt: "2026-10-29T10:30:00Z" },
      "officer",
      now,
    );
    s = await sign(
      s,
      "officer",
      "Awareness context reviewed against incident logs.",
      "2026-10-29T12:00:00Z",
    );
    expect(clocks(s.incident, s.signature, [], now)[0]!.dueAt).toBe(original);
  });
});
