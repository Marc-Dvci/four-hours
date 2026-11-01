import { describe, it, expect, vi, beforeEach } from "vitest";
const request = vi.hoisted(() => vi.fn());
vi.mock("@forge/api", () => ({
  default: { asUser: () => ({ requestJira: request }) },
  route: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((s, x, n) => s + x + (values[n] ?? ""), ""),
}));
import { actor, readable, editable, admin } from "../src/forge/access";
beforeEach(() => request.mockReset());
describe("Atlassian access boundary", () => {
  it("requires context identity", () =>
    expect(() => actor({})).toThrow("Sign in"));
  it("derives the actor from Forge context", () =>
    expect(
      actor({ accountId: "real-user", payload: { accountId: "forged" } }),
    ).toBe("real-user"));
  it("refuses a different issue in a bound panel", async () => {
    await expect(
      readable("FH-2", {
        accountId: "user",
        extension: { issue: { key: "FH-1" } },
      }),
    ).rejects.toThrow("own Jira panel");
    expect(request).not.toHaveBeenCalled();
  });
  it("refuses inaccessible Jira issues", async () => {
    request.mockResolvedValue({ ok: false, status: 403 });
    await expect(readable("FH-2", { accountId: "user" })).rejects.toThrow(
      "permission",
    );
  });
  it("checks edit permission separately from read access", async () => {
    request
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          permissions: { EDIT_ISSUES: { havePermission: false } },
        }),
      });
    await expect(editable("FH-2", { accountId: "user" })).rejects.toThrow(
      "Edit Issues",
    );
  });
  it("requires Jira admin for global setup", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        permissions: { ADMINISTER: { havePermission: false } },
      }),
    });
    await expect(admin({ accountId: "user" })).rejects.toThrow("administrator");
  });
});
