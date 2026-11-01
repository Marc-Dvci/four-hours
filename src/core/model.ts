import { z } from "zod";

export const instant = z.iso.datetime({ offset: true });
const provenance = {
  source: z.string().min(1).max(200),
  url: z
    .string()
    .url()
    .refine((s) => /^https?:\/\//.test(s), "Use an HTTP evidence link"),
  observedAt: instant,
  quality: z.enum(["measured", "estimated", "attested", "synthetic"]),
};
const fact = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), ...provenance });
const number = fact(z.number().finite().nonnegative());
const count = fact(z.number().int().nonnegative());
const bool = fact(z.boolean());
export const factsSchema = z.object({
  criticalFunction: bool,
  authorisedService: bool,
  maliciousCriticalAccess: bool,
  affectedClients: count,
  totalClients: count,
  affectedCounterparts: count,
  totalCounterparts: count,
  affectedTransactions: count,
  dailyTransactions: count,
  affectedTransactionValue: number,
  dailyTransactionValue: number,
  relevantClientsAffected: bool,
  mediaCoverage: bool,
  repeatedComplaints: bool,
  regulatoryFailure: bool,
  materialClientLoss: bool,
  durationMinutes: number,
  downtimeMinutes: number,
  memberStates: fact(z.array(z.string().regex(/^[A-Z]{2}$/)).max(100)),
  dataAdverseImpact: bool,
  maliciousAccessPotentialLoss: bool,
  economicImpact: number,
  personalDataBreach: bool,
  gdprRiskUnlikely: bool,
});
export type Facts = z.infer<typeof factsSchema>;
export type FactKey = keyof Facts;
export type Fact<T> = {
  value: T | null;
  source: string;
  url: string;
  observedAt: string;
  quality: "measured" | "estimated" | "attested" | "synthetic";
};
export const incidentSchema = z
  .object({
    id: z.string().regex(/^[A-Z][A-Z0-9_]*-\d+$/),
    title: z.string().min(1).max(250),
    serviceId: z.string().min(1).max(100),
    service: z.string().min(1).max(150),
    rootCause: z.string().max(300),
    occurredAt: instant,
    awarenessAt: instant,
    assessedAt: instant,
    privacyAwarenessAt: instant.nullable(),
    entity: z.enum([
      "credit-institution",
      "central-counterparty",
      "trading-venue",
      "nis2-essential-important",
      "other",
    ]),
    timezone: z.string().default("Europe/Paris"),
    recurrenceExempt: z.boolean(),
    synthetic: z.boolean(),
    facts: factsSchema,
  })
  .superRefine((v, ctx) => {
    if (Date.parse(v.awarenessAt) < Date.parse(v.occurredAt))
      ctx.addIssue({
        code: "custom",
        path: ["awarenessAt"],
        message: "Awareness must follow occurrence",
      });
    if (Date.parse(v.assessedAt) < Date.parse(v.awarenessAt))
      ctx.addIssue({
        code: "custom",
        path: ["assessedAt"],
        message: "Assessment must follow awareness",
      });
    for (const [key, f] of Object.entries(v.facts)) {
      if (Date.parse(f.observedAt) > Date.parse(v.assessedAt))
        ctx.addIssue({
          code: "custom",
          path: ["facts", key, "observedAt"],
          message: "Evidence cannot come from the future",
        });
    }
  });
export type Incident = z.infer<typeof incidentSchema>;
export type Tri = true | false | null;
export type Verdict = "MAJOR" | "NOT_MAJOR" | "INCOMPLETE";
export type Criterion = {
  id: string;
  label: string;
  reference: string;
  threshold: string;
  met: Tri;
  keys: FactKey[];
  reason: string;
};
export type Assessment = {
  verdict: Verdict;
  ruleVersion: string;
  criteria: Criterion[];
  metGroups: number;
  unknownGroups: number;
  missing: FactKey[];
  explanation: string;
};
export const EU_STATES = new Set(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(
    " ",
  ),
);
export const RULE_VERSION = "2024-1772.v1";
