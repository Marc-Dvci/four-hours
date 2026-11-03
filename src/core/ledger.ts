import { z } from "zod";
import {
  instant,
  privacySchema,
  type Incident,
  type PrivacyAssessment,
} from "./model";
import { classify } from "./classify";
import {
  clocks,
  initialDeadline,
  type Receipt,
  type Signature,
} from "./clocks";

export function canonical(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null)
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  throw new Error("Evidence must contain finite JSON values");
}
export async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export type Revision = {
  sequence: number;
  at: string;
  actor: string;
  action: string;
  payload: unknown;
  previousHash: string;
  hash: string;
};
export async function append(
  revisions: Revision[],
  actor: string,
  action: string,
  payload: unknown,
  now: string,
): Promise<Revision[]> {
  if (!actor.trim()) throw new Error("An authenticated actor is required");
  instant.parse(now);
  const last = revisions.at(-1);
  if (last && Date.parse(now) < Date.parse(last.at))
    throw new Error("Revision time must be monotonic");
  const body = {
    sequence: revisions.length + 1,
    at: now,
    actor,
    action,
    payload: structuredClone(payload),
    previousHash: last?.hash ?? "0".repeat(64),
  };
  return [...revisions, { ...body, hash: await hash(body) }];
}
export async function verify(revisions: Revision[]): Promise<boolean> {
  if (!Array.isArray(revisions)) return false;
  let previous = "0".repeat(64);
  let lastTime = 0;
  for (let i = 0; i < revisions.length; i++) {
    const r = revisions[i]!;
    if (
      !r ||
      !instant.safeParse(r.at).success ||
      typeof r.actor !== "string" ||
      !r.actor.trim()
    )
      return false;
    const { hash: stored, ...body } = r;
    if (
      r.sequence !== i + 1 ||
      r.previousHash !== previous ||
      Date.parse(r.at) < lastTime ||
      (await hash(body).catch(() => null)) !== stored
    )
      return false;
    previous = stored;
    lastTime = Date.parse(r.at);
  }
  return true;
}
export type RecordState = {
  incident: Incident;
  signature: Signature | null;
  receipts: Receipt[];
  revisions: Revision[];
  privacy?: PrivacyAssessment;
  recurrence?: { memberIds: string[]; members: Incident[]; detectedAt: string };
  reportDetails?: Record<
    string,
    { value: string; source: string; url: string; observedAt: string }
  >;
};
export function privacyIncident(state: RecordState): Incident {
  if (!state.privacy) return state.incident;
  const p = state.privacy;
  const assessedAt = [
    state.incident.assessedAt,
    p.personalDataBreach.observedAt,
    p.gdprRiskUnlikely.observedAt,
  ]
    .sort((a, b) => Date.parse(a) - Date.parse(b))
    .at(-1)!;
  return {
    ...state.incident,
    assessedAt,
    privacyAwarenessAt: p.awarenessAt,
    facts: {
      ...state.incident.facts,
      personalDataBreach: p.personalDataBreach,
      gdprRiskUnlikely: p.gdprRiskUnlikely,
    },
  };
}
export function doraClosed(state: RecordState): boolean {
  return state.receipts.some(
    (r) => r.kind === "final" || r.kind === "reclassification",
  );
}
/** A privacy follow-up appends evidence without rewriting the finalized DORA snapshot. */
export async function recordPrivacy(
  state: RecordState,
  input: PrivacyAssessment,
  actor: string,
  now: string,
): Promise<RecordState> {
  const privacy = privacySchema.parse(input);
  instant.parse(now);
  if (state.receipts.some((r) => r.kind === "gdpr"))
    throw new Error(
      "The GDPR notification is already recorded. Retain its evidence and create a linked privacy follow-up.",
    );
  if (
    (privacy.awarenessAt &&
      Date.parse(privacy.awarenessAt) > Date.parse(now)) ||
    [privacy.personalDataBreach, privacy.gdprRiskUnlikely].some(
      (f) => Date.parse(f.observedAt) > Date.parse(now),
    )
  )
    throw new Error("Privacy evidence and awareness cannot be in the future");
  return {
    ...state,
    privacy,
    revisions: await append(
      state.revisions,
      actor,
      "privacy.assessed",
      privacy,
      now,
    ),
  };
}
export function assertOpen(state: RecordState): void {
  if (doraClosed(state))
    throw new Error(
      "This incident is closed by its final report or reclassification notice",
    );
}
export function signedIncident(state: RecordState): Incident | null {
  const entry = [...state.revisions]
    .reverse()
    .find((r) => r.action === "classification.signed");
  return (
    (entry?.payload as { incident?: Incident } | undefined)?.incident ?? null
  );
}
export function signatureCurrent(state: RecordState): boolean {
  const snapshot = signedIncident(state);
  return (
    !!state.signature &&
    !!snapshot &&
    canonical(snapshot) === canonical(state.incident)
  );
}
export async function sign(
  state: RecordState,
  actor: string,
  rationale: string,
  now: string,
  actualClassifiedAt: string = now,
): Promise<RecordState> {
  if (!(await verify(state.revisions)))
    throw new Error("The evidence chain is invalid");
  assertOpen(state);
  instant.parse(actualClassifiedAt);
  if (
    Date.parse(actualClassifiedAt) > Date.parse(now) ||
    Date.parse(actualClassifiedAt) < Date.parse(state.incident.awarenessAt)
  )
    throw new Error(
      "Classification time must be between awareness and the attestation time",
    );
  const assessment = classify(state.incident);
  if (assessment.verdict === "INCOMPLETE")
    throw new Error("Complete the classification evidence before signing");
  if (rationale.trim().length < 12)
    throw new Error("Add a classification rationale of at least 12 characters");
  if (Date.parse(now) < Date.parse(state.incident.assessedAt))
    throw new Error("Signature cannot precede its evidence");
  const evidenceHash = await hash(state.incident);
  if (state.signature?.evidenceHash === evidenceHash)
    throw new Error("This evidence already has a signed classification");
  if (state.receipts.some((r) => r.kind === "final"))
    throw new Error("The final report is already recorded");
  const originalMajor = state.revisions.find(
    (r) =>
      r.action === "classification.signed" &&
      (r.payload as { signature?: Signature }).signature?.verdict === "MAJOR",
  );
  const firstMajorAt = originalMajor
    ? ((originalMajor.payload as { signature: Signature }).signature
        .majorClassifiedAt ??
      (originalMajor.payload as { signature: Signature }).signature
        .classifiedAt ??
      (originalMajor.payload as { signature: Signature }).signature.signedAt)
    : actualClassifiedAt;
  const firstMajorAwareness = originalMajor
    ? (originalMajor.payload as { incident: Incident }).incident.awarenessAt
    : state.incident.awarenessAt;
  const originalSignature = originalMajor
    ? (originalMajor.payload as { signature: Signature }).signature
    : null;
  const due =
    assessment.verdict === "MAJOR" || originalMajor
      ? initialDeadline(firstMajorAwareness, firstMajorAt).dueAt
      : undefined;
  const signature: Signature = {
    verdict: assessment.verdict,
    signedAt: now,
    classifiedAt: actualClassifiedAt,
    ...(assessment.verdict === "MAJOR" || originalMajor
      ? {
          majorClassifiedAt: firstMajorAt,
          majorAwarenessAt: firstMajorAwareness,
          initialDueAt: originalSignature?.initialDueAt ?? due!,
        }
      : {}),
    actor,
    evidenceHash,
    rationale: rationale.trim(),
  };
  return {
    ...state,
    signature,
    revisions: await append(
      state.revisions,
      actor,
      "classification.signed",
      { signature, incident: state.incident, assessment },
      now,
    ),
  };
}
const receiptSchema = z.object({
  kind: z.enum([
    "initial",
    "intermediate",
    "final",
    "reclassification",
    "gdpr",
  ]),
  submittedAt: instant,
  reference: z.string().trim().min(3).max(200),
  note: z.string().max(2000).optional(),
});
export async function recordSubmission(
  state: RecordState,
  input: z.input<typeof receiptSchema>,
  actor: string,
  now: string,
): Promise<RecordState> {
  if (!(await verify(state.revisions)))
    throw new Error("The evidence chain is invalid");
  const data = receiptSchema.parse(input);
  const privacy = privacyIncident(state);
  if (data.kind !== "gdpr") assertOpen(state);
  if (data.kind === "gdpr") {
    if (
      privacy.facts.personalDataBreach.value !== true ||
      privacy.facts.gdprRiskUnlikely.value !== false ||
      !privacy.privacyAwarenessAt
    )
      throw new Error(
        "Record the personal-data breach, risk test and separate awareness time first",
      );
  } else if (!state.signature) throw new Error("Sign the classification first");
  if (
    data.kind !== "gdpr" &&
    state.signature!.evidenceHash !== (await hash(state.incident))
  )
    throw new Error(
      "Evidence changed. Sign a fresh classification before recording submission",
    );
  if (Date.parse(data.submittedAt) > Date.parse(now))
    throw new Error("A submission cannot be recorded in the future");
  const historical = state.revisions
    .filter((r) => r.action === "classification.signed")
    .map((r) => (r.payload as { signature: Signature }).signature)
    .filter(
      (s) =>
        Date.parse(s.classifiedAt ?? s.signedAt) <=
        Date.parse(data.submittedAt),
    )
    .sort(
      (a, b) =>
        Date.parse(a.classifiedAt ?? a.signedAt) -
        Date.parse(b.classifiedAt ?? b.signedAt),
    )
    .at(-1);
  const reportSignature =
    data.kind === "reclassification" ? state.signature : historical;
  const classificationAnchor =
    data.kind === "gdpr"
      ? privacy.privacyAwarenessAt!
      : data.kind === "reclassification"
        ? (state.signature!.classifiedAt ?? state.signature!.signedAt)
        : (reportSignature?.majorClassifiedAt ??
          reportSignature?.classifiedAt ??
          reportSignature?.signedAt ??
          now);
  if (Date.parse(data.submittedAt) < Date.parse(classificationAnchor))
    throw new Error("Submission cannot precede the signed classification");
  if (data.kind !== "gdpr" && state.receipts.some((r) => r.kind === "final"))
    throw new Error("The final report is already recorded");
  const initial = state.receipts.find((r) => r.kind === "initial");
  const intermediates = state.receipts.filter((r) => r.kind === "intermediate");
  if (data.kind === "gdpr") {
    if (state.receipts.some((r) => r.kind === "gdpr"))
      throw new Error("A GDPR notification receipt is already recorded");
  } else if (data.kind === "reclassification") {
    if (state.signature!.verdict !== "NOT_MAJOR" || !initial)
      throw new Error(
        "A reclassification notice requires a previously reported incident now signed as not major",
      );
  } else {
    if (reportSignature?.verdict !== "MAJOR")
      throw new Error(
        "A major classification at the actual submission time is required for this report",
      );
    if (data.kind === "initial" && initial)
      throw new Error("An initial notification is already recorded");
    if (data.kind === "intermediate" && !initial)
      throw new Error("Record the initial notification first");
    if (data.kind === "final" && !intermediates.length)
      throw new Error("Record an intermediate report first");
  }
  const last = state.receipts
    .filter((r) =>
      data.kind === "gdpr" ? r.kind === "gdpr" : r.kind !== "gdpr",
    )
    .at(-1);
  if (last && Date.parse(data.submittedAt) < Date.parse(last.submittedAt))
    throw new Error("Reports must be recorded in chronological order");
  if (state.receipts.some((r) => r.reference === data.reference))
    throw new Error("This authority reference is already recorded");
  const deadline = clocks(privacy, state.signature, state.receipts, now).find(
    (c) => c.id === data.kind,
  )?.dueAt;
  if (
    deadline &&
    !(data.kind === "intermediate" && intermediates.length) &&
    Date.parse(data.submittedAt) > Date.parse(deadline) &&
    (data.note?.trim().length ?? 0) < 12
  )
    throw new Error(
      "This submission is late. Record the delay explanation provided to the authority (at least 12 characters).",
    );
  const receipt: Receipt = { ...data, actor, recordedAt: now };
  return {
    ...state,
    receipts: [...state.receipts, receipt],
    revisions: await append(
      state.revisions,
      actor,
      `report.${data.kind}.recorded`,
      receipt,
      now,
    ),
  };
}
