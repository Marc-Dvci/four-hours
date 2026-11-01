import { describe, it, expect, vi } from "vitest";
vi.mock("@forge/teamwork-graph", () => ({ graph: {} }));
vi.mock("@forge/kvs", () => ({ kvs: {} }));
import { serviceObjects } from "../src/forge/graph";
describe("technical graph projection", () => {
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
