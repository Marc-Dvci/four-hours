import { Temporal } from "@js-temporal/polyfill";
import { instant, type Incident } from "./model";

export type ReportKind =
  "initial" | "intermediate" | "final" | "reclassification" | "gdpr";
export type Receipt = {
  kind: ReportKind;
  submittedAt: string;
  reference: string;
  actor: string;
  note?: string;
  recordedAt?: string;
};
export type Signature = {
  verdict: "MAJOR" | "NOT_MAJOR";
  signedAt: string;
  classifiedAt?: string;
  majorClassifiedAt?: string;
  majorAwarenessAt?: string;
  initialDueAt?: string;
  actor: string;
  evidenceHash: string;
  rationale: string;
};
export type Clock = {
  id: string;
  label: string;
  dueAt: string | null;
  basis: string;
  status: "waiting" | "running" | "overdue" | "submitted" | "closed";
  submittedAt?: string;
  late?: boolean;
};
const at = (s: string) => {
  instant.parse(s);
  return Temporal.Instant.from(s);
};
const hours = (s: string, h: number) => at(s).add({ hours: h }).toString();
export function calendarMonth(s: string, timezone: string): string {
  return at(s)
    .toZonedDateTimeISO(timezone)
    .add({ months: 1 }, { overflow: "constrain" })
    .with({
      hour: 23,
      minute: 59,
      second: 59,
      millisecond: 999,
      microsecond: 0,
      nanosecond: 0,
    })
    .toInstant()
    .toString();
}

export function initialDeadline(
  awarenessAt: string,
  classifiedAt: string,
): { dueAt: string; basis: string } {
  if (Temporal.Instant.compare(at(classifiedAt), at(awarenessAt)) < 0)
    throw new Error("Classification cannot precede awareness");
  const cap = hours(awarenessAt, 24);
  const four = hours(classifiedAt, 4);
  if (Temporal.Instant.compare(at(classifiedAt), at(cap)) > 0)
    return {
      dueAt: four,
      basis:
        "2025/301 Art. 5(2): classification more than 24h after awareness; due within 4h",
    };
  return {
    dueAt: Temporal.Instant.compare(at(four), at(cap)) < 0 ? four : cap,
    basis:
      "2025/301 Art. 5(1)(a): earlier of classification +4h and awareness +24h",
  };
}

export type CalendarPolicy = { applyExtension: boolean; holidays: string[] };
export function extendDeadline(
  dueAt: string,
  kind: ReportKind,
  entity: Incident["entity"],
  timezone: string,
  policy?: CalendarPolicy,
): string {
  if (
    kind === "gdpr" ||
    kind === "reclassification" ||
    !policy?.applyExtension ||
    (kind !== "final" && entity !== "other")
  )
    return dueAt;
  let day = at(dueAt).toZonedDateTimeISO(timezone);
  const closed = () =>
    day.dayOfWeek >= 6 ||
    policy.holidays.includes(day.toPlainDate().toString());
  if (!closed()) return dueAt;
  do {
    day = day.add({ days: 1 });
  } while (closed());
  return day
    .with({
      hour: 12,
      minute: 0,
      second: 0,
      millisecond: 0,
      microsecond: 0,
      nanosecond: 0,
    })
    .toInstant()
    .toString();
}

export function clocks(
  incident: Incident,
  signature: Signature | null,
  receipts: Receipt[],
  now: string,
  calendar?: CalendarPolicy,
): Clock[] {
  at(now);
  const initial = receipts.find((r) => r.kind === "initial");
  const intermediate = receipts
    .filter((r) => r.kind === "intermediate")
    .sort((a, b) => Date.parse(a.submittedAt) - Date.parse(b.submittedAt));
  const latest = intermediate.at(-1);
  const first = intermediate[0];
  const final = receipts.find((r) => r.kind === "final");
  const make = (
    id: string,
    label: string,
    due: string | null,
    basis: string,
    receipt?: Receipt,
  ): Clock => ({
    id,
    label,
    dueAt: due,
    basis,
    status: receipt
      ? "submitted"
      : !due
        ? "waiting"
        : Date.parse(now) > Date.parse(due)
          ? "overdue"
          : "running",
    ...(receipt
      ? {
          submittedAt: receipt.submittedAt,
          late:
            due !== null && Date.parse(receipt.submittedAt) > Date.parse(due),
        }
      : {}),
  });
  const deadline =
    signature && (signature.verdict === "MAJOR" || signature.majorClassifiedAt)
      ? initialDeadline(
          signature.majorAwarenessAt &&
            Date.parse(signature.majorAwarenessAt) <
              Date.parse(incident.awarenessAt)
            ? signature.majorAwarenessAt
            : incident.awarenessAt,
          signature.majorClassifiedAt ?? signature.signedAt,
        )
      : null;
  if (
    deadline &&
    signature?.initialDueAt &&
    Date.parse(signature.initialDueAt) < Date.parse(deadline.dueAt)
  )
    deadline.dueAt = signature.initialDueAt;
  const adjust = (s: string, k: ReportKind) =>
    extendDeadline(s, k, incident.entity, incident.timezone, calendar);
  const result = [
    make(
      "initial",
      "Initial notification",
      deadline ? adjust(deadline.dueAt, "initial") : null,
      deadline?.basis ?? "Starts when a major classification is signed",
      initial,
    ),
    make(
      "intermediate",
      "Intermediate report",
      initial ? adjust(hours(initial.submittedAt, 72), "intermediate") : null,
      "2025/301 Art. 5(1)(b): initial submission +72h; update without undue delay and on recovery",
      first,
    ),
    make(
      "final",
      "Final report",
      latest
        ? adjust(calendarMonth(latest.submittedAt, incident.timezone), "final")
        : null,
      "2025/301 Art. 5(1)(c) and 1182/71 Art. 3(2)(c): corresponding calendar date, end of local day; review the authority's form and any applicable extension",
      final,
    ),
  ];
  const privacy = incident.facts.personalDataBreach.value;
  if (receipts.some((r) => r.kind === "reclassification"))
    for (const c of result) if (c.status !== "submitted") c.status = "closed";
  const unlikely = incident.facts.gdprRiskUnlikely.value;
  if (privacy !== false) {
    const applies = privacy === true && unlikely === false;
    result.push(
      make(
        "gdpr",
        "GDPR notification",
        applies && incident.privacyAwarenessAt
          ? hours(incident.privacyAwarenessAt, 72)
          : null,
        unlikely === true
          ? "GDPR Art. 33(1): unlikely-risk exception recorded"
          : applies
            ? "GDPR Art. 33(1): personal-data-breach awareness +72h"
            : "Assess personal-data breach and risk; separate awareness time required",
        receipts.find((r) => r.kind === "gdpr"),
      ),
    );
  }
  return result;
}

export function nextDeadline(items: Clock[]): Clock | undefined {
  return items
    .filter(
      (c) => c.dueAt && (c.status === "running" || c.status === "overdue"),
    )
    .sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))[0];
}
