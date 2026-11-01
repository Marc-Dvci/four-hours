import { kvs, Filter, FilterConditions, WhereConditions } from "@forge/kvs";
import { canonical, type RecordState } from "../core/ledger";
import { verifyRecord } from "../core/integrity";
export type Stored = { version: number; data: RecordState };
const entity = () => kvs.entity<Stored>("incident");
export const read = (key: string) => entity().get(key);
export async function save(
  key: string,
  state: RecordState,
  expectedVersion: number,
): Promise<number> {
  if (!(await verifyRecord(state)))
    throw new Error("Evidence chain verification failed");
  if (new TextEncoder().encode(canonical(state)).length > 220000)
    throw new Error(
      "This incident reached its safe storage limit. Retain an evidence bundle and create a linked follow-up incident before continuing.",
    );
  const next = { version: expectedVersion + 1, data: state };
  const condition =
    expectedVersion === 0
      ? FilterConditions.notExists()
      : FilterConditions.equalTo(expectedVersion);
  try {
    await kvs
      .transact()
      .set(key, next, {
        entityName: "incident",
        conditions: new Filter<Stored>().and("version", condition),
      })
      .set(`fh:index:${key}`, { key })
      .execute();
  } catch {
    throw new Error(
      "The save could not be committed. Another session may have changed the incident, or Forge storage is unavailable. Refresh before retrying.",
    );
  }
  return next.version;
}
export async function keys(): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | undefined;
  do {
    const q = kvs
      .query()
      .where("key", WhereConditions.beginsWith("fh:index:"))
      .limit(100);
    const page = await (cursor ? q.cursor(cursor) : q).getMany<{
      key: string;
    }>();
    out.push(...page.results.map((r) => r.value.key));
    cursor = page.nextCursor;
    if (out.length > 1000)
      throw new Error("Narrow the incident population before continuing");
  } while (cursor);
  return out;
}
