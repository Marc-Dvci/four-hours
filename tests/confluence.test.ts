import { describe, expect, it, vi } from "vitest";
vi.mock("@forge/api", () => ({ default: {}, route: () => "" }));
import { toStorage } from "../src/forge/confluence";

describe("workpaper storage format", () => {
  it("renders headings, tables, lists and escapes text", () => {
    const html = toStorage(
      "# OPS-6\n\n| Criterion | Result |\n|---|---|\n| Critical services | MET |\n\n- initial: 11:00 <ok>\n",
    );
    expect(html).toContain("<h1>OPS-6</h1>");
    expect(html).toContain("<th>Criterion</th><th>Result</th>");
    expect(html).toContain("<td>Critical services</td><td>MET</td>");
    expect(html).not.toContain("<td>---</td>");
    expect(html).toContain("<li>initial: 11:00 &lt;ok&gt;</li>");
  });
});
