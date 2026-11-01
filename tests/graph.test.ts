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
    [["synthetic-critical-function"], true],
    [["synthetic-non-critical-function"], false],
  ] as const)
    it(`requires an explicit classification mapping: ${expected}`, async () => {
      getSetting.mockResolvedValue("connected");
      getObject.mockResolvedValue({
        success: true,
        object: {
          displayName: "Synthetic service",
          url: "https://example.com/service",
          "atlassian:software-service": { environment: "synthetic", tags },
        },
      });
      if (expected === undefined)
        await expect(serviceEvidence("urgent-payments")).rejects.toThrow(
          "no classification mapping",
        );
      else
        expect((await serviceEvidence("urgent-payments")).value).toBe(expected);
    });
  it("projects only synthetic technical service metadata", () => {
    const objects = serviceObjects(
      "https://test.atlassian.net",
      "2026-10-29T12:00:00Z",
    );
    expect(objects).toHaveLength(2);
    expect(
      objects.every(
        (x) => x["atlassian:software-service"].environment === "synthetic",
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
