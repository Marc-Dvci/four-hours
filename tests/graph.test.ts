import { describe, it, expect, vi } from "vitest";
const { getObject, getSetting } = vi.hoisted(() => ({
  getObject: vi.fn(),
  getSetting: vi.fn(),
}));
vi.mock("@forge/teamwork-graph", () => ({
  graph: { getObjectByExternalId: getObject },
}));
vi.mock("@forge/kvs", () => ({ kvs: { get: getSetting } }));
import { serviceObjects, serviceEvidence } from "../src/forge/graph";
describe("technical graph projection", () => {
  for (const [tags, expected] of [
    [[], undefined],
    [["critical-function"], true],
    [["non-critical-function"], false],
  ] as const)
    it(`requires an explicit classification mapping: ${expected}`, async () => {
      getSetting.mockResolvedValue("connected");
      getObject.mockResolvedValue({
        success: true,
        object: {
          displayName: "Urgent payments",
          url: "https://example.com/service",
          "atlassian:software-service": { environment: "demo", tags },
        },
      });
      if (expected === undefined)
        await expect(serviceEvidence("urgent-payments")).rejects.toThrow(
          "no classification mapping",
        );
      else
        expect((await serviceEvidence("urgent-payments")).value).toBe(expected);
    });
  it("reads the flattened object returned by the live read API", async () => {
    getSetting.mockResolvedValue("connected");
    getObject.mockResolvedValue({
      success: true,
      object: {
        displayName: "Urgent payments · technical service",
        url: "https://example.com/service",
        schemaVersion: "2.0",
        environment: "demo",
        tags: ["demo", "critical-function"],
      },
    });
    const fact = await serviceEvidence("urgent-payments");
    expect(fact.value).toBe(true);
    expect(fact.source).toBe(
      "Teamwork Graph · Urgent payments · technical service",
    );
  });
  it("writes software-service objects with schema version 2.0", () => {
    for (const o of serviceObjects(
      "https://test.atlassian.net",
      "2026-10-29T12:00:00Z",
    ))
      expect(o.schemaVersion).toBe("2.0");
  });
  it("projects only the demo bank's technical service metadata", () => {
    const objects = serviceObjects(
      "https://test.atlassian.net",
      "2026-10-29T12:00:00Z",
    );
    expect(objects).toHaveLength(2);
    expect(
      objects.every(
        (x) => x["atlassian:software-service"].environment === "demo",
      ),
    ).toBe(true);
  });
  it("excludes classification and customer-impact facts", () => {
    const text = JSON.stringify(
      serviceObjects("https://test.atlassian.net", "2026-10-29T12:00:00Z"),
    );
    for (const field of [
      "affectedClients",
      "economicImpact",
      "accountId",
      "personalDataBreach",
      "rationale",
    ])
      expect(text).not.toContain(field);
  });
});
