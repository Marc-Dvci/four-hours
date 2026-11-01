import {
  incidentSchema,
  type Facts,
  type Incident,
  type FactKey,
} from "../core/model";
import type { RecordState } from "../core/ledger";

export const REPLAY_NOW = "2026-10-29T11:08:00+01:00";
export const BASE_VALUES = {
  criticalFunction: false,
  authorisedService: false,
  maliciousCriticalAccess: false,
  affectedClients: 20,
  totalClients: 1000,
  affectedCounterparts: 2,
  totalCounterparts: 100,
  affectedTransactions: 20,
  dailyTransactions: 1000,
  affectedTransactionValue: 1000,
  dailyTransactionValue: 100000,
  relevantClientsAffected: false,
  mediaCoverage: false,
  repeatedComplaints: false,
  regulatoryFailure: false,
  materialClientLoss: false,
  durationMinutes: 35,
  downtimeMinutes: 20,
  memberStates: ["FR"],
  dataAdverseImpact: false,
  maliciousAccessPotentialLoss: false,
  economicImpact: 8000,
  personalDataBreach: false,
  gdprRiskUnlikely: true,
};
export type Values = { [K in FactKey]: Facts[K]["value"] };
export function makeIncident(
  patch: Partial<Values> = {},
  overrides: Partial<Omit<Incident, "facts">> = {},
): Incident {
  const values = { ...BASE_VALUES, ...patch };
  const facts = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      {
        value,
        source:
          key === "criticalFunction"
            ? "Service register · CIF-004"
            : ["memberStates", "affectedClients", "totalClients"].includes(key)
              ? "Customer impact · CRM snapshot"
              : key === "economicImpact"
                ? "Finance · incident estimate"
                : "Operations · incident log",
        url: `https://demo.example/evidence/${key}`,
        observedAt: "2026-10-29T10:55:00+01:00",
        quality: "synthetic",
      },
    ]),
  ) as Facts;
  return incidentSchema.parse({
    id: "FH-482",
    title: "Urgent payments are not reaching settlement",
    serviceId: "urgent-payments",
    service: "Urgent payments",
    rootCause: "Settlement adapter connection pool exhaustion",
    occurredAt: "2026-10-29T08:45:00+01:00",
    awarenessAt: "2026-10-29T09:00:00+01:00",
    assessedAt: "2026-10-29T11:00:00+01:00",
    privacyAwarenessAt: null,
    entity: "credit-institution",
    timezone: "Europe/Paris",
    recurrenceExempt: false,
    synthetic: true,
    ...overrides,
    facts,
  });
}
export const demoIncidents: Incident[] = [
  makeIncident({
    criticalFunction: true,
    authorisedService: true,
    affectedClients: 18400,
    totalClients: 120000,
    affectedTransactions: 3280,
    dailyTransactions: 19000,
    affectedTransactionValue: 49200000,
    dailyTransactionValue: 210000000,
    memberStates: ["FR", "DE", "NL"],
    durationMinutes: 135,
    downtimeMinutes: 128,
    economicImpact: 76000,
  }),
  makeIncident(
    {
      criticalFunction: true,
      affectedClients: null,
      memberStates: ["FR"],
      economicImpact: 115000,
    },
    {
      id: "FH-483",
      title: "Card authorisations failing intermittently",
      serviceId: "card-authorisation",
      service: "Card authorisations",
      rootCause: "Unknown; investigation open",
    },
  ),
  makeIncident(
    {},
    {
      id: "FH-481",
      title: "Internal status page refresh delayed",
      serviceId: "status-page",
      service: "Internal status page",
      rootCause: "Cache refresh timeout",
    },
  ),
  makeIncident(
    {
      criticalFunction: true,
      memberStates: ["FR", "DE"],
      economicImpact: 60000,
    },
    {
      id: "FH-476",
      title: "A second settlement-adapter interruption",
      serviceId: "settlement-adapter",
      service: "Settlement adapter",
      rootCause: "Adapter heartbeat timeout",
    },
  ),
  makeIncident(
    {
      criticalFunction: true,
      memberStates: ["FR", "DE"],
      economicImpact: 55000,
    },
    {
      id: "FH-441",
      title: "Settlement adapter heartbeat interrupted",
      serviceId: "settlement-adapter",
      service: "Settlement adapter",
      rootCause: "Adapter heartbeat timeout",
      occurredAt: "2026-08-12T08:45:00+02:00",
      awarenessAt: "2026-08-12T09:00:00+02:00",
    },
  ),
];
export const seedStates = (): RecordState[] =>
  structuredClone(demoIncidents).map((incident) => ({
    incident,
    signature: null,
    receipts: [],
    revisions: [],
  }));
export type ServiceNode = {
  id: string;
  label: string;
  kind: "incident" | "service" | "function" | "deployment" | "country";
  detail: string;
};
export const serviceGraph: {
  nodes: ServiceNode[];
  edges: { from: string; to: string; label: string }[];
} = {
  nodes: [
    {
      id: "FH-482",
      label: "FH-482",
      kind: "incident",
      detail: "Urgent payments incident · synthetic replay",
    },
    {
      id: "urgent-payments",
      label: "Urgent payments",
      kind: "service",
      detail: "Tier 1 · Operations owner · SEPA and high-value payments",
    },
    {
      id: "cif-004",
      label: "Payment execution",
      kind: "function",
      detail: "CIF-004 · Critical or important function · Register v7",
    },
    {
      id: "settlement-adapter",
      label: "Settlement adapter",
      kind: "service",
      detail: "Routes urgent payment instructions to settlement",
    },
    {
      id: "release-29",
      label: "Adapter 2.8.1",
      kind: "deployment",
      detail: "Released 08:32 CET · time correlation, cause unconfirmed",
    },
    {
      id: "FR",
      label: "France",
      kind: "country",
      detail: "12,400 affected clients · synthetic CRM snapshot",
    },
    {
      id: "DE",
      label: "Germany",
      kind: "country",
      detail: "4,100 affected clients · synthetic CRM snapshot",
    },
    {
      id: "NL",
      label: "Netherlands",
      kind: "country",
      detail: "1,900 affected clients · synthetic CRM snapshot",
    },
  ],
  edges: [
    { from: "FH-482", to: "urgent-payments", label: "affects" },
    { from: "urgent-payments", to: "cif-004", label: "supports" },
    { from: "urgent-payments", to: "settlement-adapter", label: "depends on" },
    {
      from: "settlement-adapter",
      to: "release-29",
      label: "recent deployment",
    },
    { from: "urgent-payments", to: "FR", label: "clients in" },
    { from: "urgent-payments", to: "DE", label: "clients in" },
    { from: "urgent-payments", to: "NL", label: "clients in" },
  ],
};
