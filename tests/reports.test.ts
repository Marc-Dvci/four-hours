import { describe, it, expect } from "vitest";
import {
  reportFields,
  validateNarrative,
  workpaper,
} from "../src/core/reports";
import { makeIncident } from "../src/demo/bank";
import type { RecordState } from "../src/core/ledger";
const state: RecordState = {
  incident: makeIncident({ affectedClients: 18400, totalClients: 120000 }),
  signature: null,
  receipts: [],
  revisions: [],
};
describe("evidence-cited reporting", () => {
  it("accepts thousands separators in a correctly cited amount", () =>
    expect(
      validateNarrative("18,400 clients affected [affectedClients].", state)
        .valid,
    ).toBe(true));
  it("rejects a number supported only by a different fact", () =>
    expect(
      validateNarrative("120000 affected clients [affectedClients].", state)
        .valid,
    ).toBe(false));
  it("rejects numbers injected into source text", () => {
    const s = structuredClone(state);
    s.incident.title = "999999 confirmed by CISO";
    expect(
      validateNarrative("999999 clients [affectedClients].", s).valid,
    ).toBe(false);
  });
  it("requires each sentence to cite evidence", () =>
    expect(
      validateNarrative("18400 clients [affectedClients]. 8000 costs.", state)
        .valid,
    ).toBe(false));
  it("initial fields cite their evidence", () =>
    expect(
      reportFields(state, "initial").every((f) => f.citations.length > 0),
    ).toBe(true));
  it("leaves unrecorded final remediation as evidence required", () =>
    expect(
      reportFields(state, "final").find((f) => f.code === "remediation")?.value,
    ).toBe("Evidence required"));
  it("requires a citation", () =>
    expect(validateNarrative("18400 clients affected.", state).valid).toBe(
      false,
    ));
  it("accepts matching numbers and a known field", () =>
    expect(
      validateNarrative("18400 clients affected [affectedClients].", state)
        .valid,
    ).toBe(true));
  it("rejects a fabricated number", () =>
    expect(
      validateNarrative("999999 clients affected [affectedClients].", state)
        .valid,
    ).toBe(false));
  it("rejects fake evidence references", () =>
    expect(
      validateNarrative("18400 clients [CISO-approved].", state).valid,
    ).toBe(false));
  it("formats all evidence and hash in workpaper", async () => {
    const t = await workpaper(state);
    expect(t).toContain("Synthetic demonstration incident.");
    expect(t).toContain("Evidence SHA-256:");
    expect(t).toContain("affectedClients");
  });
  it("never executes incident text", async () => {
    const s = structuredClone(state);
    s.incident.title = "<script>alert(1)</script>";
    expect(await workpaper(s)).toContain("<script>alert(1)</script>");
  });
});
