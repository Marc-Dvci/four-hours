import { z } from "zod";
import { instant } from "./model";
import { append, assertOpen, type RecordState } from "./ledger";
import type { ReportKind } from "./clocks";
export const REPORT_DETAILS = [
  {
    code: "financial-entity-type",
    label: "Financial entity type under DORA Article 2(1)",
    reference: "2025/301 Art. 1(b)",
    stages: ["initial", "intermediate", "final", "reclassification"],
  },
  {
    code: "aggregated-entities",
    label: "Aggregated financial entities and LEIs (where applicable)",
    reference: "2025/301 Art. 1(d)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "parent-undertaking",
    label: "Parent undertaking identification (where applicable)",
    reference: "2025/301 Art. 1(f)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "incident-description",
    label: "Detailed incident description",
    reference: "2025/301 Art. 2(c)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "threat-techniques",
    label: "Threat actor techniques (where applicable)",
    reference: "2025/301 Art. 3(f)",
    stages: ["intermediate", "final"],
  },
  {
    code: "compromise-indicators",
    label: "Indicators of compromise (where applicable)",
    reference: "2025/301 Art. 3(l)",
    stages: ["intermediate", "final"],
  },
  {
    code: "client-financial-impact",
    label: "Impact on the financial interests of clients",
    reference: "2025/301 Art. 3(i)",
    stages: ["intermediate", "final"],
  },
  {
    code: "activities-recovered-at",
    label: "Recovery of regular activities (where applicable)",
    reference: "2025/301 Art. 3(c)",
    stages: ["intermediate", "final"],
  },
  {
    code: "resolution-authority",
    label: "Information for resolution authorities (where applicable)",
    reference: "2025/301 Art. 4(d)",
    stages: ["final"],
  },
  {
    code: "entity-name",
    label: "Financial entity name",
    reference: "2025/301 Art. 1(b)",
    stages: ["initial", "intermediate", "final", "reclassification"],
  },
  {
    code: "entity-lei",
    label: "Financial entity LEI",
    reference: "2025/301 Art. 1(b)",
    stages: ["initial", "intermediate", "final", "reclassification"],
  },
  {
    code: "submitting-entity",
    label: "Submitting entity name and identification",
    reference: "2025/301 Art. 1(c)",
    stages: ["initial", "intermediate", "final", "reclassification"],
  },
  {
    code: "authority-contact",
    label: "Authority contact person and contact details",
    reference: "2025/301 Art. 1(e)",
    stages: ["initial", "intermediate", "final", "reclassification"],
  },
  {
    code: "discovery",
    label: "How the incident was discovered",
    reference: "2025/301 Art. 2(f)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "continuity",
    label: "Business continuity plan activation",
    reference: "2025/301 Art. 2(h)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "incident-origin",
    label: "Incident origin (where available) and incident type",
    reference: "2025/301 Art. 2(g), Art. 3(e)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "operational-impact",
    label: "Impact on functions, services and infrastructure",
    reference: "2025/301 Art. 3(g), (h)",
    stages: ["intermediate", "final"],
  },
  {
    code: "client-communications",
    label: "Communications to clients and other authorities",
    reference: "2025/301 Art. 3(j)",
    stages: ["intermediate", "final"],
  },
  {
    code: "temporary-actions",
    label: "Temporary recovery actions and next steps",
    reference: "2025/301 Art. 3(k)",
    stages: ["intermediate", "final"],
  },
  {
    code: "resolved-at",
    label: "Incident resolution date and time",
    reference: "2025/301 Art. 4(b)",
    stages: ["final"],
  },
  {
    code: "root-cause-addressed",
    label: "Root cause addressed date and time",
    reference: "2025/301 Art. 4(b)",
    stages: ["final"],
  },
  {
    code: "remediation",
    label: "Resolution and preventive actions",
    reference: "2025/301 Art. 4(c)",
    stages: ["final"],
  },
  {
    code: "cost-breakdown",
    label: "Direct and indirect costs, losses and financial recoveries",
    reference: "2025/301 Art. 4(e)",
    stages: ["final"],
  },
  {
    code: "reclassification-reason",
    label: "Reason for reclassification",
    reference: "2025/301 Art. 2(i)",
    stages: ["reclassification"],
  },
  {
    code: "detected-at",
    label: "Date and time the incident was detected",
    reference: "2025/301 Art. 2(b)",
    stages: ["initial", "intermediate", "final"],
  },
  {
    code: "breach-description",
    label: "Description of the personal-data breach",
    reference: "GDPR Art. 33(3)(a)",
    stages: ["gdpr"],
  },
  {
    code: "privacy-contact",
    label: "Controller and data-protection contact details",
    reference: "GDPR Art. 33(3)(b)",
    stages: ["gdpr"],
  },
  {
    code: "data-subjects",
    label: "Data-subject categories and approximate numbers",
    reference: "GDPR Art. 33(3)(a)",
    stages: ["gdpr"],
  },
  {
    code: "data-categories",
    label: "Personal-data categories and approximate records",
    reference: "GDPR Art. 33(3)(a)",
    stages: ["gdpr"],
  },
  {
    code: "privacy-consequences",
    label: "Likely consequences of the personal-data breach",
    reference: "GDPR Art. 33(3)(c)",
    stages: ["gdpr"],
  },
  {
    code: "privacy-measures",
    label: "Measures taken or proposed to address the breach",
    reference: "GDPR Art. 33(3)(d)",
    stages: ["gdpr"],
  },
] as const;
export type DetailCode = (typeof REPORT_DETAILS)[number]["code"];
export const detailCode = z.enum(
  REPORT_DETAILS.map((f) => f.code) as [DetailCode, ...DetailCode[]],
);
export async function updateReportDetail(
  state: RecordState,
  input: unknown,
  actor: string,
  now: string,
): Promise<RecordState> {
  const entry = z
    .object({
      code: detailCode,
      value: z.string().trim().min(1).max(4000),
      source: z.string().trim().min(3).max(200),
      url: z
        .string()
        .url()
        .refine((s) => /^https?:\/\//.test(s)),
    })
    .parse(input);
  const definition = REPORT_DETAILS.find((f) => f.code === entry.code)!;
  if (!(definition.stages as readonly string[]).includes("gdpr"))
    assertOpen(state);
  if (entry.code === "entity-lei" && !/^[A-Z0-9]{20}$/.test(entry.value))
    throw new Error(
      "Enter a 20-character LEI using uppercase letters and digits",
    );
  if (
    (entry.code === "resolved-at" ||
      entry.code === "root-cause-addressed" ||
      entry.code === "activities-recovered-at") &&
    !instant.safeParse(entry.value).success
  )
    throw new Error("Enter a valid date and time with a timezone");
  if (
    (entry.code === "resolved-at" ||
      entry.code === "root-cause-addressed" ||
      entry.code === "activities-recovered-at") &&
    Date.parse(entry.value) > Date.parse(now)
  )
    throw new Error("A completed resolution cannot be dated in the future");
  const { code, ...fact } = entry;
  const record = { ...fact, observedAt: now };
  return {
    ...state,
    reportDetails: { ...state.reportDetails, [code]: record },
    revisions: await append(
      state.revisions,
      actor,
      "report.field.updated",
      { code, fact: record },
      now,
    ),
  };
}
export const detailsFor = (kind: ReportKind) =>
  REPORT_DETAILS.filter((f) => (f.stages as readonly string[]).includes(kind));
