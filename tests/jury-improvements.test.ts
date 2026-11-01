import { describe, it, expect } from "vitest";
import { makeIncident } from "../src/demo/bank";
import {
  append,
  hash,
  sign,
  recordSubmission,
  type RecordState,
} from "../src/core/ledger";
import { updateEvidence } from "../src/core/evidence";
import { updateReportDetail } from "../src/core/report-details";
import { verifyRecord } from "../src/core/integrity";
import { evidenceBundle } from "../src/core/bundle";
import { collectiveCase, recurring } from "../src/core/recurrence";
import { clocks, nextDeadline } from "../src/core/clocks";
import { reportFields } from "../src/core/reports";
import { mkdirSync, writeFileSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
const now = "2026-10-29T11:00:00Z";
async function state(): Promise<RecordState> {
  const incident = makeIncident({
    criticalFunction: true,
    economicImpact: 200000,
    memberStates: ["FR", "DE"],
  });
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
describe("evidence and workflow hardening", () => {
  it("links a report value to its exact fact when source labels are shared", async () => {
    const s = await state();
    for (const fact of Object.values(s.incident.facts))
      fact.source = "Shared monitoring label";
    const field = reportFields(s, "initial").find((f) => f.code === "clients")!;
    expect(field.sourceUrls).toEqual([s.incident.facts.affectedClients.url]);
  });
  it("does not aggregate distinct financial entities sharing an apparent root cause", () => {
    const a = makeIncident(
      {
        criticalFunction: true,
        economicImpact: 60000,
        memberStates: ["FR", "DE"],
      },
      { id: "FH-2", entityId: "entity-a" },
    );
    const b = makeIncident(
      {
        criticalFunction: true,
        economicImpact: 60000,
        memberStates: ["FR", "DE"],
      },
      {
        id: "FH-1",
        entityId: "entity-b",
        occurredAt: "2026-08-01T08:00:00Z",
        awarenessAt: "2026-08-01T09:00:00Z",
      },
    );
    expect(recurring(a, [b]).aggregated).toBeNull();
  });
  it("records a historical major notification after a later non-major classification", async () => {
    let s = await sign(
      await state(),
      "officer",
      "Major evidence confirmed.",
      now,
    );
    s = await updateEvidence(
      s,
      {
        field: "criticalFunction",
        value: false,
        source: "Corrected service register",
        url: "https://example.com/service",
      },
      "officer",
      "2026-10-29T12:00:00Z",
    );
    s = await sign(
      s,
      "officer",
      "Corrected critical gateway is not met.",
      "2026-10-29T12:00:00Z",
    );
    expect(s.signature!.verdict).toBe("NOT_MAJOR");
    s = await recordSubmission(
      s,
      {
        kind: "initial",
        submittedAt: "2026-10-29T11:30:00Z",
        reference: "NCA-historical",
      },
      "officer",
      "2026-10-29T12:30:00Z",
    );
    expect(s.receipts[0]!.submittedAt).toBe("2026-10-29T11:30:00Z");
    expect(await verifyRecord(s)).toBe(true);
  });
  it("keeps the GDPR report editable after DORA closure and exports its source", async () => {
    let s = await sign(
      await state(),
      "officer",
      "Major evidence confirmed.",
      now,
    );
    for (const kind of ["initial", "intermediate", "final"] as const)
      s = await recordSubmission(
        s,
        { kind, submittedAt: now, reference: `NCA-${kind}` },
        "officer",
        now,
      );
    s = await updateReportDetail(
      s,
      {
        code: "breach-description",
        value: "Personal identifiers were disclosed.",
        source: "Privacy investigation",
        url: "https://example.com/privacy",
      },
      "privacy-officer",
      now,
    );
    const description = reportFields(s, "gdpr").find(
      (f) => f.code === "breach-description",
    )!;
    expect(description.value).toContain("identifiers");
    expect(description.sourceUrls).toEqual(["https://example.com/privacy"]);
    expect(await verifyRecord(s)).toBe(true);
    await expect(
      updateReportDetail(
        s,
        {
          code: "remediation",
          value: "Changed",
          source: "Closed record",
          url: "https://example.com",
        },
        "officer",
        now,
      ),
    ).rejects.toThrow("closed");
  });
  it("requires an explicit timezone for reported resolution dates", async () => {
    await expect(
      updateReportDetail(
        await state(),
        {
          code: "resolved-at",
          value: "2026-10-29 09:00",
          source: "Recovery log",
          url: "https://example.com",
        },
        "officer",
        now,
      ),
    ).rejects.toThrow("timezone");
  });
  it("requires an explanation before recording a late submission", async () => {
    const s = await sign(
      await state(),
      "officer",
      "Major incident evidence confirmed.",
      now,
    );
    await expect(
      recordSubmission(
        s,
        {
          kind: "initial",
          submittedAt: "2026-10-29T16:00:00Z",
          reference: "NCA-late",
        },
        "officer",
        "2026-10-29T16:00:00Z",
      ),
    ).rejects.toThrow("delay explanation");
    const result = await recordSubmission(
      s,
      {
        kind: "initial",
        submittedAt: "2026-10-29T16:00:00Z",
        reference: "NCA-late",
        note: "The authority portal was unavailable; the duty officer was informed.",
      },
      "officer",
      "2026-10-29T16:00:00Z",
    );
    expect(result.receipts[0]!.note).toContain("portal");
  });
  for (const field of ["constructor", "__proto__", "toString"])
    it(`refuses prototype field ${field}`, async () => {
      await expect(
        updateEvidence(
          await state(),
          {
            field,
            value: 1,
            source: "test source",
            url: "https://example.com",
          },
          "officer",
          now,
        ),
      ).rejects.toThrow();
    });
  it("tracks current projection as well as the chain", async () => {
    const s = await state();
    s.incident.facts.economicImpact.value = 1;
    expect(await verifyRecord(s)).toBe(false);
  });
  it("detects a forged signature projection", async () => {
    const s = await sign(
      await state(),
      "officer",
      "Major incident evidence confirmed.",
      now,
    );
    s.signature!.actor = "forged";
    expect(await verifyRecord(s)).toBe(false);
  });
  it("verifies an ordinary evidence update", async () => {
    const s = await updateEvidence(
      await state(),
      {
        field: "economicImpact",
        value: 150000,
        source: "Updated loss estimate",
        url: "https://example.com",
      },
      "officer",
      now,
    );
    expect(await verifyRecord(s)).toBe(true);
  });
  it("allows sourced final report remediation", async () => {
    const s = await updateReportDetail(
      await state(),
      {
        code: "remediation",
        value: "Restarted adapter and limited connection pool.",
        source: "Recovery record",
        url: "https://example.com",
      },
      "officer",
      now,
    );
    expect(
      reportFields(s, "final").find((f) => f.code === "remediation")?.value,
    ).toContain("Restarted");
    expect(await verifyRecord(s)).toBe(true);
  });
  it("records actual classification separately from later attestation", async () => {
    const s = await sign(
      await state(),
      "officer",
      "Evidence reviewed and classification attested.",
      "2026-10-29T12:00:00Z",
      "2026-10-29T10:00:00Z",
    );
    expect(s.signature!.signedAt).toBe("2026-10-29T12:00:00Z");
    expect(
      clocks(s.incident, s.signature, [], "2026-10-29T12:00:00Z")[0]!.dueAt,
    ).toBe("2026-10-29T14:00:00Z");
  });
  it("rejects a future classification timestamp", async () =>
    await expect(
      sign(
        await state(),
        "officer",
        "Evidence reviewed and classification attested.",
        now,
        "2026-10-29T12:00:00Z",
      ),
    ).rejects.toThrow("Classification time"));
  it("selects the next actual deadline after the initial receipt", async () => {
    let s = await sign(
      await state(),
      "officer",
      "Major incident evidence confirmed.",
      now,
    );
    s = await recordSubmission(
      s,
      { kind: "initial", submittedAt: now, reference: "NCA-1" },
      "officer",
      now,
    );
    expect(
      nextDeadline(clocks(s.incident, s.signature, s.receipts, now))?.id,
    ).toBe("intermediate");
  });
  it("can record GDPR notification independently of DORA classification", async () => {
    const s = await state();
    s.incident = makeIncident(
      { personalDataBreach: true, gdprRiskUnlikely: false },
      { privacyAwarenessAt: "2026-10-29T10:00:00Z" },
    );
    s.revisions = await append([], "seed", "incident.created", s.incident, now);
    const result = await recordSubmission(
      s,
      { kind: "gdpr", submittedAt: now, reference: "DPA-1" },
      "privacy-officer",
      now,
    );
    expect(
      clocks(result.incident, null, result.receipts, now).find(
        (c) => c.id === "gdpr",
      )?.status,
    ).toBe("submitted");
  });
  it("creates a distinct collective record and preserves individual incident figures", async () => {
    const a = makeIncident(
      {
        criticalFunction: true,
        economicImpact: 60000,
        memberStates: ["FR", "DE"],
      },
      { id: "FH-2" },
    );
    const b = makeIncident(
      {
        criticalFunction: true,
        economicImpact: 55000,
        memberStates: ["FR", "DE"],
      },
      {
        id: "FH-1",
        occurredAt: "2026-08-01T08:00:00Z",
        awarenessAt: "2026-08-01T09:00:00Z",
      },
    );
    const before = await hash([a, b]);
    const c = await collectiveCase(a, [b], "FH-3", "officer", now);
    expect(c.incident.facts.economicImpact.value).toBe(115000);
    expect(c.recurrence?.memberIds).toEqual(["FH-2", "FH-1"]);
    expect(await hash([a, b])).toBe(before);
    expect(await verifyRecord(c)).toBe(true);
  });
  it("verifies a bundle with a separate Node-only implementation", async () => {
    const s = await sign(
      await state(),
      "officer",
      "Major incident evidence confirmed.",
      now,
    );
    const bundle = await evidenceBundle(s, now);
    mkdirSync(".local", { recursive: true });
    const file = `.local/bundle-test-${crypto.randomUUID()}.json`;
    writeFileSync(file, JSON.stringify(bundle));
    try {
      const result = spawnSync(
        process.execPath,
        ["scripts/verify-bundle.mjs", file, bundle.bundleHash],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout).externalAnchorChecked).toBe(true);
      const wrong = spawnSync(
        process.execPath,
        ["scripts/verify-bundle.mjs", file, "0".repeat(64)],
        { encoding: "utf8" },
      );
      expect(wrong.status).toBe(1);
    } finally {
      unlinkSync(file);
    }
  });
});
