import { Temporal } from "@js-temporal/polyfill";
import { classify, any } from "./classify";
import type { Incident, FactKey, Assessment } from "./model";

export type RecurrenceResult = {
  incidentIds: string[];
  assessment: Assessment | null;
  reason: string;
  aggregated: Incident | null;
};
/** Only proven disjoint monetary losses are additive. People and transaction populations require deduplication. */
export function recurring(
  current: Incident,
  candidates: Incident[],
): RecurrenceResult {
  const none = (reason: string): RecurrenceResult => ({
    incidentIds: [],
    assessment: null,
    reason,
    aggregated: null,
  });
  if (current.recurrenceExempt)
    return none("Article 8(2) exemption recorded for this entity.");
  if (!current.rootCause.trim() || /^unknown/i.test(current.rootCause))
    return none("A common apparent root cause is required.");
  if (classify(current).verdict !== "NOT_MAJOR")
    return none(
      "The recurring-incident route combines incidents individually assessed as not major.",
    );
  const end = Temporal.Instant.from(current.awarenessAt);
  const start = end
    .toZonedDateTimeISO(current.timezone)
    .subtract({ months: 6 })
    .toInstant();
  const unique = new Map<string, Incident>();
  for (const i of [current, ...candidates]) {
    if (
      i.serviceId !== current.serviceId ||
      i.rootCause.trim().toLowerCase() !==
        current.rootCause.trim().toLowerCase()
    )
      continue;
    const when = Temporal.Instant.from(i.awarenessAt);
    if (
      Temporal.Instant.compare(when, start) < 0 ||
      Temporal.Instant.compare(when, end) > 0 ||
      classify(i).verdict !== "NOT_MAJOR"
    )
      continue;
    unique.set(i.id, i);
  }
  const group = [...unique.values()];
  if (group.length < 2)
    return none(
      "No matching non-major incident in the preceding six calendar months.",
    );
  const aggregate = structuredClone(current);
  const bools: FactKey[] = [
    "criticalFunction",
    "authorisedService",
    "maliciousCriticalAccess",
    "relevantClientsAffected",
    "mediaCoverage",
    "repeatedComplaints",
    "regulatoryFailure",
    "materialClientLoss",
    "dataAdverseImpact",
    "maliciousAccessPotentialLoss",
  ];
  for (const k of bools)
    (aggregate.facts[k] as { value: unknown }).value = any(
      ...group.map((i) => i.facts[k].value as boolean | null),
    );
  // Repeated customers and transactions cannot be summed without stable source identifiers.
  for (const k of [
    "affectedClients",
    "affectedCounterparts",
    "affectedTransactions",
    "affectedTransactionValue",
  ] as const)
    aggregate.facts[k].value = null;
  // A combined duration is not the elapsed gap between separate outages.
  aggregate.facts.durationMinutes.value = null;
  aggregate.facts.downtimeMinutes.value = null;
  // Avoid double-counting costs when incident windows overlap. The officer must attest a combined estimate instead.
  const intervals = group
    .map((i) => [
      Date.parse(i.occurredAt),
      Date.parse(i.occurredAt) +
        (i.facts.durationMinutes.value ?? Infinity) * 60000,
    ])
    .sort((a, b) => a[0]! - b[0]!);
  const disjoint = intervals.every(
    (x, n) => n === 0 || x[0]! >= intervals[n - 1]![1]!,
  );
  aggregate.facts.economicImpact.value =
    disjoint && group.every((i) => i.facts.economicImpact.value !== null)
      ? group.reduce((s, i) => s + i.facts.economicImpact.value!, 0)
      : null;
  aggregate.facts.memberStates.value = group.some(
    (i) => i.facts.memberStates.value === null,
  )
    ? null
    : [...new Set(group.flatMap((i) => i.facts.memberStates.value!))];
  for (const f of Object.values(aggregate.facts)) {
    f.source = `Recurring group: ${group.map((i) => i.id).join(", ")}`;
    f.quality = "estimated";
  }
  return {
    incidentIds: group.map((i) => i.id),
    assessment: classify(aggregate),
    aggregated: aggregate,
    reason: disjoint
      ? "Same service and apparent root cause within six months. Distinct incident costs combined; people and transaction counts require deduplication."
      : "Overlapping incident windows: a combined cost estimate is required.",
  };
}
