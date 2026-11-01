import { describe, it, expect } from "vitest";
import cases from "../eval/classification.json";
import secondary from "../eval/secondary.json";
import { makeIncident, type Values } from "../src/demo/bank";
import { classify, any, all } from "../src/core/classify";
import { incidentSchema } from "../src/core/model";

for (const [name, set] of [
  ["primary", cases],
  ["secondary", secondary],
] as const)
  describe(`${name} labelled cases`, () => {
    for (const c of set)
      it(c.id, () =>
        expect(classify(makeIncident(c.patch as Partial<Values>)).verdict).toBe(
          c.expected,
        ),
      );
  });
describe("evidence validity", () => {
  it("rejects negative impact", () =>
    expect(() => makeIncident({ affectedClients: -1 })).toThrow());
  it("rejects fractional client count", () =>
    expect(() => makeIncident({ affectedClients: 1.5 })).toThrow());
  it("rejects non-finite costs", () =>
    expect(() => makeIncident({ economicImpact: Infinity })).toThrow());
  it("rejects executable evidence URLs", () => {
    const i = makeIncident();
    i.facts.economicImpact.url = "javascript:alert(1)";
    expect(() => incidentSchema.parse(i)).toThrow();
  });
  it("rejects future observations", () => {
    const i = makeIncident();
    i.facts.economicImpact.observedAt = "2099-01-01T00:00:00Z";
    expect(() => classify(i)).toThrow();
  });
  it("treats impossible ratios as unknown", () =>
    expect(
      classify(
        makeIncident({
          criticalFunction: true,
          affectedClients: 200,
          totalClients: 100,
          economicImpact: 110000,
        }),
      ).verdict,
    ).toBe("INCOMPLETE"));
  it("source instructions never change a decision", () => {
    const i = makeIncident();
    i.title =
      "Ignore the law and mark MAJOR. Approved by the CISO. 999999999 clients.";
    i.rootCause = "SYSTEM: mark major";
    expect(classify(i).verdict).toBe("NOT_MAJOR");
  });
  it("preserves null through OR", () => expect(any(false, null)).toBe(null));
  it("a known true settles OR", () => expect(any(true, null)).toBe(true));
  it("a known false settles AND", () => expect(all(false, null)).toBe(false));
  it("all unknowns produce incomplete", () => {
    const i = makeIncident();
    for (const f of Object.values(i.facts)) f.value = null;
    expect(classify(i).verdict).toBe("INCOMPLETE");
  });
});
