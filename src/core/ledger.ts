import { z } from "zod";
import { instant, type Incident } from "./model";
import { classify } from "./classify";
import type { Receipt, Signature } from "./clocks";

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
  let previous = "0".repeat(64);
  let lastTime = 0;
  for (let i = 0; i < revisions.length; i++) {
    const r = revisions[i]!;
    const { hash: stored, ...body } = r;
    if (
      r.sequence !== i + 1 ||
      r.previousHash !== previous ||
      Date.parse(r.at) < lastTime ||
      (await hash(body)) !== stored
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
};
export async function sign(
  state: RecordState,
  actor: string,
  rationale: string,
  now: string,
): Promise<RecordState> {
  if (!(await verify(state.revisions)))
    throw new Error("The evidence chain is invalid");
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
    ? (originalMajor.payload as { signature: Signature }).signature.signedAt
    : now;
  const firstMajorAwareness = originalMajor
    ? (originalMajor.payload as { incident: Incident }).incident.awarenessAt
    : state.incident.awarenessAt;
  const signature: Signature = {
    verdict: assessment.verdict,
    signedAt: now,
    ...(assessment.verdict === "MAJOR" || originalMajor
      ? {
          majorClassifiedAt: firstMajorAt,
          majorAwarenessAt: firstMajorAwareness,
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
  kind: z.enum(["initial", "intermediate", "final", "reclassification"]),
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
  if (!state.signature) throw new Error("Sign the classification first");
  if (state.signature.evidenceHash !== (await hash(state.incident)))
    throw new Error(
      "Evidence changed. Sign a fresh classification before recording submission",
    );
  if (Date.parse(data.submittedAt) > Date.parse(now))
    throw new Error("A submission cannot be recorded in the future");
  if (Date.parse(data.submittedAt) < Date.parse(state.signature.signedAt))
    throw new Error("Submission cannot precede the signed classification");
  if (state.receipts.some((r) => r.kind === "final"))
    throw new Error("The final report is already recorded");
  const initial = state.receipts.find((r) => r.kind === "initial");
  const intermediates = state.receipts.filter((r) => r.kind === "intermediate");
  if (data.kind === "reclassification") {
    if (state.signature.verdict !== "NOT_MAJOR" || !initial)
      throw new Error(
        "A reclassification notice requires a previously reported incident now signed as not major",
      );
  } else {
    if (state.signature.verdict !== "MAJOR")
      throw new Error("A major classification is required for this report");
    if (data.kind === "initial" && initial)
      throw new Error("An initial notification is already recorded");
    if (data.kind === "intermediate" && !initial)
      throw new Error("Record the initial notification first");
    if (data.kind === "final" && !intermediates.length)
      throw new Error("Record an intermediate report first");
  }
  const last = state.receipts.at(-1);
  if (last && Date.parse(data.submittedAt) < Date.parse(last.submittedAt))
    throw new Error("Reports must be recorded in chronological order");
  if (state.receipts.some((r) => r.reference === data.reference))
    throw new Error("This authority reference is already recorded");
  const receipt: Receipt = { ...data, actor };
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
