import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import { makeIncident } from "../src/demo/bank";
import { classify } from "../src/core/classify";
import type { Tri } from "../src/core/model";
const values: Tri[] = [false, true, null];
const failures: unknown[] = [];
const samples: number[] = [];
let correct = 0;
// Independent truth-completion oracle: decide each possible complete world, then
// ask whether all worlds agree. It does not use the engine's three-valued helpers.
function expected(facts: Tri[]): string {
  let outcomes = new Set<boolean>();
  function complete(at: number, world: boolean[]) {
    if (at === facts.length) {
      const [
        critical,
        special,
        clients,
        reputation,
        duration,
        geography,
        data,
        economic,
      ] = world;
      const groups = [
        clients,
        reputation,
        duration,
        geography,
        data || special,
        economic,
      ];
      outcomes.add(
        !!critical && (!!special || groups.filter(Boolean).length >= 2),
      );
      return;
    }
    for (const v of facts[at] === null ? [false, true] : [facts[at]!])
      complete(at + 1, [...world, v]);
  }
  complete(0, []);
  return outcomes.size > 1
    ? "INCOMPLETE"
    : outcomes.has(true)
      ? "MAJOR"
      : "NOT_MAJOR";
}
for (let n = 0; n < 3 ** 8; n++) {
  let x = n;
  const f: Tri[] = [];
  for (let k = 0; k < 8; k++) {
    f.push(values[x % 3]!);
    x = Math.floor(x / 3);
  }
  const [
    critical,
    special,
    clients,
    reputation,
    duration,
    geography,
    data,
    economic,
  ] = f;
  const i = makeIncident({
    criticalFunction: critical!,
    maliciousAccessPotentialLoss: special!,
    affectedClients: clients === null ? null : clients ? 120 : 20,
    mediaCoverage: reputation!,
    durationMinutes: duration === null ? null : duration ? 1441 : 35,
    memberStates: geography === null ? null : geography ? ["FR", "DE"] : ["FR"],
    dataAdverseImpact: data!,
    economicImpact: economic === null ? null : economic ? 100001 : 8000,
  });
  const t = performance.now();
  const actual = classify(i).verdict;
  samples.push(performance.now() - t);
  const label = expected(f);
  if (actual === label) correct++;
  else if (failures.length < 20) failures.push({ facts: f, label, actual });
}
samples.sort((a, b) => a - b);
const report = {
  cases: 3 ** 8,
  correct,
  failures,
  method:
    "Exhaustive truth completion over eight three-valued inputs representing the critical gateway, special route and materiality groups. Logical conformance, not independent legal or production validation.",
  latency: {
    unit: "milliseconds per classification",
    p50: samples[Math.floor(samples.length * 0.5)],
    p95: samples[Math.floor(samples.length * 0.95)],
    runtime: process.version,
  },
};
await mkdir("eval/reports", { recursive: true });
await writeFile(
  "eval/reports/logical-conformance.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  `${correct}/${3 ** 8} logical cases agree with independent truth completion`,
);
if (correct !== 3 ** 8) {
  console.error(failures);
  process.exitCode = 1;
}
