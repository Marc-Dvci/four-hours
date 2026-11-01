import { describe, it, expect } from "vitest";
import {
  append,
  canonical,
  hash,
  verify,
  sign,
  recordSubmission,
  type RecordState,
} from "../src/core/ledger";
import { makeIncident } from "../src/demo/bank";
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
const signed = () =>
  sign(
    state(),
    "account:officer",
    "Critical services and two impact groups evidenced.",
    now,
  );
describe("hash ledger", () => {
  it("canonicalises object order", async () =>
    expect(await hash({ z: 1, a: 2 })).toBe(await hash({ a: 2, z: 1 })));
  it("rejects non-JSON values", () =>
    expect(() => canonical({ value: undefined })).toThrow());
  it("verifies an intact chain", async () => {
    const first = await append([], "a", "action", { v: 1 }, now);
    expect(await verify(await append(first, "b", "next", { v: 2 }, now))).toBe(
      true,
    );
  });
  it("detects modified evidence", async () => {
    const r = await append([], "a", "action", { v: 1 }, now);
    r[0]!.payload = { v: 2 };
    expect(await verify(r)).toBe(false);
  });
  it("detects deleted revisions", async () => {
    const a = await append([], "a", "a", 1, now);
    const b = await append(a, "a", "b", 2, now);
    expect(await verify(b.slice(1))).toBe(false);
  });
  it("rejects anonymous signatures", async () =>
    await expect(
      sign(state(), "", "Classification evidence confirmed.", now),
    ).rejects.toThrow("authenticated"));
  it("refuses incomplete signatures", async () => {
    const s = state();
    s.incident.facts.criticalFunction.value = null;
    await expect(
      sign(s, "officer", "Evidence reviewed by officer", now),
    ).rejects.toThrow("Complete");
  });
  it("binds signature to evidence", async () => {
    const s = await signed();
    expect(s.signature!.evidenceHash).toBe(await hash(s.incident));
    expect(await verify(s.revisions)).toBe(true);
  });
  it("refuses duplicate signatures", async () =>
    await expect(
      sign(await signed(), "officer", "Evidence reviewed by officer", now),
    ).rejects.toThrow("already"));
  it("requires evidence-current signatures for a receipt", async () => {
    const s = await signed();
    s.incident.facts.economicImpact.value = 250000;
    await expect(
      recordSubmission(
        s,
        { kind: "initial", submittedAt: now, reference: "NCA-1" },
        "officer",
        now,
      ),
    ).rejects.toThrow("Evidence changed");
  });
  it("preserves original classification through evidence revisions", async () => {
    const s = await signed();
    s.incident.facts.economicImpact.value = 250000;
    const s2 = await sign(
      s,
      "officer",
      "Updated impact figures reviewed.",
      "2026-10-29T12:00:00Z",
    );
    expect(s2.signature!.majorClassifiedAt).toBe(now);
  });
  it("rejects future submission times", async () =>
    await expect(
      recordSubmission(
        await signed(),
        {
          kind: "initial",
          submittedAt: "2026-10-30T10:00:00Z",
          reference: "NCA-1",
        },
        "officer",
        now,
      ),
    ).rejects.toThrow("future"));
  it("requires initial before intermediate", async () =>
    await expect(
      recordSubmission(
        await signed(),
        { kind: "intermediate", submittedAt: now, reference: "NCA-1" },
        "officer",
        now,
      ),
    ).rejects.toThrow("initial"));
  it("requires intermediate before final", async () =>
    await expect(
      recordSubmission(
        await signed(),
        { kind: "final", submittedAt: now, reference: "NCA-1" },
        "officer",
        now,
      ),
    ).rejects.toThrow("intermediate"));
  it("keeps report identity server-supplied", async () => {
    const s = await recordSubmission(
      await signed(),
      {
        kind: "initial",
        submittedAt: now,
        reference: "NCA-1",
        actor: "forged",
      } as never,
      "actual-user",
      now,
    );
    expect(s.receipts[0]!.actor).toBe("actual-user");
  });
  it("rejects a second initial report", async () => {
    const s = await recordSubmission(
      await signed(),
      { kind: "initial", submittedAt: now, reference: "NCA-1" },
      "officer",
      now,
    );
    await expect(
      recordSubmission(
        s,
        { kind: "initial", submittedAt: now, reference: "NCA-2" },
        "officer",
        now,
      ),
    ).rejects.toThrow("already");
  });
  it("rejects reused authority reference", async () => {
    const s = await recordSubmission(
      await signed(),
      { kind: "initial", submittedAt: now, reference: "NCA-1" },
      "officer",
      now,
    );
    await expect(
      recordSubmission(
        s,
        { kind: "intermediate", submittedAt: now, reference: "NCA-1" },
        "officer",
        now,
      ),
    ).rejects.toThrow("already recorded");
  });
  it("can record intermediate updates and final", async () => {
    let s = await recordSubmission(
      await signed(),
      { kind: "initial", submittedAt: now, reference: "NCA-1" },
      "officer",
      now,
    );
    for (const [kind, reference] of [
      ["intermediate", "NCA-2"],
      ["intermediate", "NCA-3"],
      ["final", "NCA-4"],
    ] as const)
      s = await recordSubmission(
        s,
        { kind, submittedAt: now, reference },
        "officer",
        now,
      );
    expect(s.receipts).toHaveLength(4);
    expect(await verify(s.revisions)).toBe(true);
  });
});
