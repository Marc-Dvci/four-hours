import { describe, it, expect } from "vitest";
import {
  calendarMonth,
  initialDeadline,
  extendDeadline,
  clocks,
  type Signature,
  type Receipt,
} from "../src/core/clocks";
import { makeIncident } from "../src/demo/bank";

describe("initial notification", () => {
  it("uses classification plus four hours", () =>
    expect(
      initialDeadline("2026-10-01T08:00:00Z", "2026-10-01T10:00:00Z").dueAt,
    ).toBe("2026-10-01T14:00:00Z"));
  it("caps normal classification at awareness plus 24h", () =>
    expect(
      initialDeadline("2026-10-01T08:00:00Z", "2026-10-02T07:00:00Z").dueAt,
    ).toBe("2026-10-02T08:00:00Z"));
  it("applies late-classification exception after 24h", () =>
    expect(
      initialDeadline("2026-10-01T08:00:00Z", "2026-10-02T10:00:00Z").dueAt,
    ).toBe("2026-10-02T14:00:00Z"));
  it("at exactly 24h, awareness cap still applies", () =>
    expect(
      initialDeadline("2026-10-01T08:00:00Z", "2026-10-02T08:00:00Z").dueAt,
    ).toBe("2026-10-02T08:00:00Z"));
  it("rejects classification before awareness", () =>
    expect(() =>
      initialDeadline("2026-10-01T08:00:00Z", "2026-10-01T07:00:00Z"),
    ).toThrow());
});
describe("calendar month", () => {
  it("clamps January 31 to February 28", () =>
    expect(calendarMonth("2026-01-31T12:00:00Z", "Europe/Paris")).toBe(
      "2026-02-28T12:00:00Z",
    ));
  it("handles leap years", () =>
    expect(calendarMonth("2028-01-31T12:00:00Z", "Europe/Paris")).toBe(
      "2028-02-29T12:00:00Z",
    ));
  it("keeps local clock time over DST", () =>
    expect(calendarMonth("2026-03-15T12:00:00Z", "Europe/Paris")).toBe(
      "2026-04-15T11:00:00Z",
    ));
  it("handles December to January", () =>
    expect(calendarMonth("2026-12-31T12:00:00Z", "Europe/Paris")).toBe(
      "2027-01-31T12:00:00Z",
    ));
});
describe("working-day extension", () => {
  const policy = { applyExtension: true, holidays: ["2026-11-02"] };
  it("never extends a bank initial notification", () =>
    expect(
      extendDeadline(
        "2026-10-31T14:00:00Z",
        "initial",
        "credit-institution",
        "Europe/Paris",
        policy,
      ),
    ).toBe("2026-10-31T14:00:00Z"));
  it("never extends a bank intermediate report", () =>
    expect(
      extendDeadline(
        "2026-10-31T14:00:00Z",
        "intermediate",
        "credit-institution",
        "Europe/Paris",
        policy,
      ),
    ).toBe("2026-10-31T14:00:00Z"));
  it("allows a final report by local noon on the next working day", () =>
    expect(
      extendDeadline(
        "2026-10-31T14:00:00Z",
        "final",
        "credit-institution",
        "Europe/Paris",
        policy,
      ),
    ).toBe("2026-11-03T11:00:00Z"));
  it("eligible other entities can extend initial notification", () =>
    expect(
      extendDeadline(
        "2026-10-31T14:00:00Z",
        "initial",
        "other",
        "Europe/Paris",
        policy,
      ),
    ).toBe("2026-11-03T11:00:00Z"));
  it("extensions require an explicit calendar policy", () =>
    expect(
      extendDeadline("2026-10-31T14:00:00Z", "final", "other", "Europe/Paris"),
    ).toBe("2026-10-31T14:00:00Z"));
});
describe("clock stages", () => {
  const i = makeIncident();
  const s: Signature = {
    verdict: "MAJOR",
    signedAt: "2026-10-29T10:00:00Z",
    actor: "officer",
    evidenceHash: "abc",
    rationale: "A valid classification",
  };
  const initial: Receipt = {
    kind: "initial",
    submittedAt: "2026-10-29T11:00:00Z",
    reference: "NCA-1",
    actor: "officer",
  };
  it("unsigned incidents have no running regulatory clock", () =>
    expect(
      clocks(i, null, [], "2026-10-29T11:00:00Z").every(
        (c) => c.status === "waiting",
      ),
    ).toBe(true));
  it("starts the 72h clock from submission", () =>
    expect(clocks(i, s, [initial], "2026-10-29T12:00:00Z")[1]!.dueAt).toBe(
      "2026-11-01T11:00:00Z",
    ));
  it("latest intermediate controls final deadline", () => {
    const rs: Receipt[] = [
      initial,
      {
        kind: "intermediate",
        submittedAt: "2026-10-30T11:00:00Z",
        reference: "NCA-2",
        actor: "a",
      },
      {
        kind: "intermediate",
        submittedAt: "2026-11-02T12:00:00Z",
        reference: "NCA-3",
        actor: "a",
      },
    ];
    expect(clocks(i, s, rs, "2026-11-03T12:00:00Z")[2]!.dueAt).toBe(
      "2026-12-02T12:00:00Z",
    );
  });
  it("keeps first major classification on later signatures", () =>
    expect(
      clocks(
        i,
        {
          ...s,
          signedAt: "2026-10-29T12:00:00Z",
          majorClassifiedAt: s.signedAt,
        },
        [],
        "2026-10-29T12:00:00Z",
      )[0]!.dueAt,
    ).toBe("2026-10-29T14:00:00Z"));
  it("marks overdue rather than clipping the deadline", () =>
    expect(clocks(i, s, [], "2026-10-29T15:00:00Z")[0]!.status).toBe(
      "overdue",
    ));
  it("flags a late submitted report", () => {
    expect(
      clocks(
        i,
        s,
        [{ ...initial, submittedAt: "2026-10-29T16:00:00Z" }],
        "2026-10-29T17:00:00Z",
      )[0]!.late,
    ).toBe(true);
  });
  it("GDPR uses personal breach awareness, not ICT awareness", () => {
    const p = makeIncident(
      { personalDataBreach: true, gdprRiskUnlikely: false },
      { privacyAwarenessAt: "2026-10-29T12:00:00Z" },
    );
    expect(clocks(p, s, [], "2026-10-29T12:00:00Z").at(-1)!.dueAt).toBe(
      "2026-11-01T12:00:00Z",
    );
  });
  it("does not invent a GDPR deadline when risk is unknown", () => {
    const p = makeIncident(
      { personalDataBreach: true, gdprRiskUnlikely: null },
      { privacyAwarenessAt: "2026-10-29T12:00:00Z" },
    );
    expect(clocks(p, s, [], "2026-10-29T12:00:00Z").at(-1)!.status).toBe(
      "waiting",
    );
  });
});
