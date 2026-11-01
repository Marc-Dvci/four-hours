import { Temporal } from "@js-temporal/polyfill";
import { classify, any } from "./classify";
import {
  incidentSchema,
  EU_STATES,
  type Incident,
  type FactKey,
  type Assessment,
} from "./model";
import { append, type RecordState } from "./ledger";

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
  if (
    !current.rootCause.trim() ||
    /^(unknown|tbd|pending|under investigation|not (known|established))/i.test(
      current.rootCause,
    )
  )
    return none("A common apparent root cause is required.");
  if (classify(current).verdict !== "NOT_MAJOR")
    return none(
      "The recurring-incident route combines incidents individually assessed as not major.",
    );
  const end = Temporal.Instant.from(current.occurredAt);
  const start = end
    .toZonedDateTimeISO(current.timezone)
    .subtract({ months: 6 })
    .toInstant();
  const unique = new Map<string, Incident>();
  for (const i of [current, ...candidates]) {
    if (
      i.entityId !== current.entityId ||
      i.rootCause.trim().toLowerCase() !==
        current.rootCause.trim().toLowerCase()
    )
      continue;
    const when = Temporal.Instant.from(i.occurredAt);
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
  const knownStates = [
    ...new Set(group.flatMap((i) => i.facts.memberStates.value ?? [])),
  ];
  aggregate.facts.memberStates.value =
    knownStates.filter((s) => EU_STATES.has(s)).length >= 2
      ? knownStates
      : group.some((i) => i.facts.memberStates.value === null)
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
      ? "Same apparent root cause within six months across visible managed incidents. Disjoint costs combined as an estimate; shared or duplicate invoices require officer review. Customer and transaction counts require deduplication."
      : "Overlapping incident windows: a combined cost estimate is required.",
  };
}

export async function collectiveCase(
  current: Incident,
  members: Incident[],
  id: string,
  actor: string,
  now: string,
): Promise<RecordState> {
  const result = recurring(current, members);
  if (!result.aggregated || !result.assessment || result.incidentIds.length < 2)
    throw new Error("A qualifying recurring group is required");
  const selected = result.incidentIds.map((key) =>
    [current, ...members].find((i) => i.id === key)!,
  );
  const incident = incidentSchema.parse({
    ...result.aggregated,
    id,
    title: `Recurring incidents: ${result.incidentIds.join(" + ")}`,
    occurredAt: selected.reduce(
      (earliest, i) =>
        Date.parse(i.occurredAt) < Date.parse(earliest)
          ? i.occurredAt
          : earliest,
      current.occurredAt,
    ),
    awarenessAt: now,
    assessedAt: now,
    service: `Collective assessment (${selected.length} incidents)`,
    serviceId: `collective:${id}`,
  });
  const recurrence = {
    memberIds: result.incidentIds,
    members: structuredClone(selected),
    detectedAt: now,
  };
  return {
    incident,
    signature: null,
    receipts: [],
    recurrence,
    revisions: await append(
      [],
      actor,
      "incident.created",
      { incident, recurrence },
      now,
    ),
  };
}
