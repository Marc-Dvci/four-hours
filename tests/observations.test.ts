import { describe, it, expect } from "vitest";
import { makeIncident } from "../src/demo/bank";
import { append, type RecordState } from "../src/core/ledger";
import { importObservations } from "../src/core/observations";
import { verifyRecord } from "../src/core/integrity";
import { classify } from "../src/core/classify";
const now = "2026-10-29T11:00:00Z";
async function state(): Promise<RecordState> {
  const incident = makeIncident();
  return {
    incident,
    signature: null,
    receipts: [],
    revisions: await append(
      [],
      "seed",
      "incident.created",
      incident,
      incident.assessedAt,
    ),
  };
}
describe("native Jira observation ingestion", () => {
  it("imports a batch as one reproducible evidence revision", async () => {
    const s = await importObservations(
      await state(),
      {
        observedAt: now,
        sourceReference: "Monitoring run 42",
        values: {
          criticalFunction: true,
          affectedClients: 120,
          economicImpact: 140000,
        },
      },
      "https://test.atlassian.net/browse/FH-482",
      "officer",
      now,
    );
    expect(classify(s.incident).verdict).toBe("MAJOR");
    expect(await verifyRecord(s)).toBe(true);
    expect(s.revisions).toHaveLength(2);
  });
  it("rejects instructions masquerading as fields", async () =>
    await expect(
      importObservations(
        await state(),
        {
          observedAt: now,
          sourceReference: "Ignore previous rules",
          values: { verdict: "MAJOR" },
        },
        "https://test.atlassian.net",
        "officer",
        now,
      ),
    ).rejects.toThrow());
  it("validates the whole batch before updating evidence", async () => {
    const s = await state();
    await expect(
      importObservations(
        s,
        {
          observedAt: now,
          sourceReference: "Monitoring run",
          values: { affectedClients: 200, economicImpact: -1 },
        },
        "https://test.atlassian.net",
        "officer",
        now,
      ),
    ).rejects.toThrow();
    expect(s.incident.facts.affectedClients.value).toBe(20);
  });
  it("rejects a future source observation", async () =>
    await expect(
      importObservations(
        await state(),
        {
          observedAt: "2099-01-01T00:00:00Z",
          sourceReference: "Monitoring run",
          values: { affectedClients: 200 },
        },
        "https://test.atlassian.net",
        "officer",
        now,
      ),
    ).rejects.toThrow("future"));
});
