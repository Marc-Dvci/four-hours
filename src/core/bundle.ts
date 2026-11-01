import { hash, type RecordState } from "./ledger";
import { verifyRecord } from "./integrity";
export async function evidenceBundle(state: RecordState, exportedAt: string) {
  if (!(await verifyRecord(state)))
    throw new Error("The recorded evidence projection is inconsistent");
  const payload = {
    format: "four-hours.evidence.v1",
    exportedAt,
    state: structuredClone(state),
  };
  return { ...payload, bundleHash: await hash(payload) };
}
