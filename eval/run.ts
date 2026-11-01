import { readFile, writeFile, mkdir } from "node:fs/promises";
import { classify } from "../src/core/classify";
import { makeIncident, type Values } from "../src/demo/bank";
import { hash } from "../src/core/ledger";
type Case = {
  id: string;
  patch: Partial<Values>;
  expected: "MAJOR" | "NOT_MAJOR" | "INCOMPLETE";
};
const labels = ["MAJOR", "NOT_MAJOR", "INCOMPLETE"] as const;
const matrix = Object.fromEntries(
  labels.map((x) => [x, Object.fromEntries(labels.map((y) => [y, 0]))]),
);
let total = 0;
let correct = 0;
const failures = [];
const hashes: Record<string, string> = {};
for (const file of ["classification.json", "secondary.json"]) {
  const raw = await readFile(new URL(file, import.meta.url), "utf8");
  hashes[file] = await hash(JSON.parse(raw));
  for (const c of JSON.parse(raw) as Case[]) {
    const actual = classify(makeIncident(c.patch)).verdict;
    matrix[c.expected]![actual]!++;
    total++;
    if (actual === c.expected) correct++;
    else failures.push({ id: c.id, expected: c.expected, actual });
  }
}
const result = {
  total,
  correct,
  accuracy: correct / total,
  matrix,
  failures,
  fixtureHashes: hashes,
  scope:
    "Labelled synthetic legal-boundary cases; no production accuracy claim.",
};
await mkdir("eval/reports", { recursive: true });
await writeFile(
  "eval/reports/results.json",
  JSON.stringify(result, null, 2) + "\n",
);
await writeFile(
  "eval/reports/RESULTS.md",
  `# Classification evaluation\n\n${correct}/${total} labelled synthetic cases correct.\n\nRows are labels; columns are predictions.\n\n| Label | MAJOR | NOT_MAJOR | INCOMPLETE |\n|---|---:|---:|---:|\n${labels.map((x) => `| ${x} | ${labels.map((y) => matrix[x]![y]).join(" | ")} |`).join("\n")}\n\nReproduce: \`npm run eval\`.\n\n${result.scope}\n`,
);
console.log(`${correct}/${total} cases correct`);
console.log(JSON.stringify(matrix));
if (failures.length) {
  console.error(failures);
  process.exitCode = 1;
}
