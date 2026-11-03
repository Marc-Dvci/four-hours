import { expect, it } from "vitest";
import { makeIncident } from "../src/demo/bank";
import {
  append,
  canonical,
  hash,
  privacyIncident,
  recordSubmission,
  sign,
  signatureCurrent,
  type RecordState,
} from "../src/core/ledger";
import { updateEvidence } from "../src/core/evidence";
import { updateContext } from "../src/core/context";
import { classify } from "../src/core/classify";
import { verifyRecord } from "../src/core/integrity";
import { evidenceBundle } from "../src/core/bundle";
import { clocks } from "../src/core/clocks";
import { reportFields } from "../src/core/reports";
const now = "2026-11-03T10:00:00Z";
async function closed(): Promise<RecordState> {
  const incident = makeIncident({
    criticalFunction: true,
    economicImpact: 200000,
    memberStates: ["FR", "DE"],
  });
  let state: RecordState = {
    incident,
    signature: null,
    receipts: [],
    revisions: await append(
      [],
      "officer",
      "incident.created",
      incident,
      "2026-10-29T10:00:00Z",
    ),
  };
  state = await sign(
    state,
    "officer",
    "Sourced evidence supports a major classification.",
    "2026-10-29T11:00:00Z",
  );
  for (const [kind, reference] of [
    ["initial", "NCA-1"],
    ["intermediate", "NCA-2"],
    ["final", "NCA-3"],
  ] as const)
    state = await recordSubmission(
      state,
      { kind, reference, submittedAt: "2026-10-29T11:00:00Z" },
      "officer",
      "2026-10-29T11:00:00Z",
    );
  return state;
}
const edit = (state: RecordState, field: string, value: boolean) =>
  updateEvidence(
    state,
    {
      field,
      value,
      source: "New privacy investigation",
      url: "https://example.com/privacy-evidence",
    },
    "officer",
    now,
  );
it.each([
  ["affectedClients", "totalClients"],
  ["affectedCounterparts", "totalCounterparts"],
  ["affectedTransactions", "dailyTransactions"],
  ["affectedTransactionValue", "dailyTransactionValue"],
] as const)(
  "identifies an inconsistent %s ratio and both repairable fields",
  (numerator, denominator) => {
    const result = classify(
      makeIncident({
        criticalFunction: true,
        economicImpact: 200000,
        [numerator]: 120,
        [denominator]: 100,
      }),
    );
    expect(result.verdict).toBe("INCOMPLETE");
    expect(result.missing).toContain(numerator);
    expect(result.missing).toContain(denominator);
    expect(result.evidenceIssues[0]?.reason).toContain("exceeds");
  },
);
it("records a separate privacy follow-up and receipt without changing the finalized DORA decision", async () => {
  let state = await closed();
  const original = canonical(state.incident);
  const signature = canonical(state.signature);
  state = await edit(state, "personalDataBreach", true);
  state = await edit(state, "gdprRiskUnlikely", false);
  state = await updateContext(
    state,
    {
      ...state.incident,
      occurredAt: new Date(state.incident.occurredAt).toISOString(),
      awarenessAt: new Date(state.incident.awarenessAt).toISOString(),
      privacyAwarenessAt: "2026-11-03T09:00:00Z",
    },
    "officer",
    now,
  );
  expect(canonical(state.incident)).toBe(original);
  expect(canonical(state.signature)).toBe(signature);
  expect(signatureCurrent(state)).toBe(true);
  expect(await verifyRecord(state)).toBe(true);
  expect(
    reportFields(state, "gdpr").find((f) => f.code === "privacy-awareness")
      ?.value,
  ).toBe("2026-11-03T09:00:00Z");
  const due = clocks(
    privacyIncident(state),
    state.signature,
    state.receipts,
    now,
  ).find((c) => c.id === "gdpr");
  expect(due?.dueAt).toBe("2026-11-06T09:00:00Z");
  state = await recordSubmission(
    state,
    { kind: "gdpr", reference: "DPA-1", submittedAt: now },
    "officer",
    now,
  );
  expect(await verifyRecord(state)).toBe(true);
  const bundle = await evidenceBundle(state, now);
  const { verifyBundle } = await import(
    new URL("../scripts/verify-bundle.mjs", import.meta.url).href
  );
  expect(verifyBundle(bundle, bundle.bundleHash).valid).toBe(true);
  const altered = structuredClone(bundle);
  altered.state.privacy!.personalDataBreach.value = false;
  const { bundleHash: _old, ...payload } = altered;
  altered.bundleHash = await hash(payload);
  expect(verifyBundle(altered).valid).toBe(false);
  await expect(edit(state, "personalDataBreach", false)).rejects.toThrow(
    "GDPR notification is already recorded",
  );
});
it("continues to reject DORA edits after closure and future privacy awareness", async () => {
  const state = await closed();
  await expect(edit(state, "economicImpact", true)).rejects.toThrow("closed");
  await expect(
    updateContext(
      state,
      { ...state.incident, rootCause: "Rewrite finalized cause" },
      "officer",
      now,
    ),
  ).rejects.toThrow("closed");
  await expect(
    updateContext(
      state,
      { ...state.incident, privacyAwarenessAt: "2026-11-04T09:00:00Z" },
      "officer",
      now,
    ),
  ).rejects.toThrow("future");
});
