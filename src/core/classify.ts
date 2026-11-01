import {
  EU_STATES,
  RULE_VERSION,
  incidentSchema,
  type Assessment,
  type Criterion,
  type Facts,
  type FactKey,
  type Incident,
  type Tri,
} from "./model";

export const any = (...xs: Tri[]): Tri =>
  xs.includes(true) ? true : xs.includes(null) ? null : false;
export const all = (...xs: Tri[]): Tri =>
  xs.includes(false) ? false : xs.includes(null) ? null : true;
const gt = (x: number | null, limit: number): Tri =>
  x === null ? null : x > limit;
const share = (n: number | null, d: number | null, percent: number): Tri =>
  n === null || d === null || d <= 0 || n > d ? null : n * 100 > d * percent;

export function classify(input: Incident): Assessment {
  const incident = incidentSchema.parse(input);
  const f = incident.facts;
  const v = <K extends FactKey>(k: K): Facts[K]["value"] => f[k].value;
  const criteria: Criterion[] = [];
  const row = (
    id: string,
    label: string,
    reference: string,
    threshold: string,
    met: Tri,
    keys: FactKey[],
  ) => {
    criteria.push({
      id,
      label,
      reference,
      threshold,
      met,
      keys,
      reason:
        met === null
          ? "Evidence required to settle this criterion."
          : met
            ? "At least one threshold is met."
            : "The recorded evidence is below every threshold.",
    });
  };
  const critical = any(
    v("criticalFunction"),
    v("authorisedService"),
    v("maliciousCriticalAccess"),
  );
  row(
    "critical",
    "Critical services",
    "Art. 6",
    "Critical or important function, regulated financial service, or malicious access to critical systems",
    critical,
    ["criticalFunction", "authorisedService", "maliciousCriticalAccess"],
  );
  row(
    "clients",
    "Clients & transactions",
    "Art. 9(1)",
    ">10% clients; >100,000 clients; >30% counterparts; >10% transaction count or value; or relevant clients",
    any(
      share(v("affectedClients"), v("totalClients"), 10),
      gt(v("affectedClients"), 100000),
      share(v("affectedCounterparts"), v("totalCounterparts"), 30),
      share(v("affectedTransactions"), v("dailyTransactions"), 10),
      share(v("affectedTransactionValue"), v("dailyTransactionValue"), 10),
      v("relevantClientsAffected"),
    ),
    [
      "affectedClients",
      "totalClients",
      "affectedCounterparts",
      "totalCounterparts",
      "affectedTransactions",
      "dailyTransactions",
      "affectedTransactionValue",
      "dailyTransactionValue",
      "relevantClientsAffected",
    ],
  );
  row(
    "reputation",
    "Reputational impact",
    "Art. 9(2), Art. 2",
    "Media coverage, repeated complaints, likely regulatory failure, or material client loss",
    any(
      v("mediaCoverage"),
      v("repeatedComplaints"),
      v("regulatoryFailure"),
      v("materialClientLoss"),
    ),
    [
      "mediaCoverage",
      "repeatedComplaints",
      "regulatoryFailure",
      "materialClientLoss",
    ],
  );
  row(
    "duration",
    "Duration & downtime",
    "Art. 9(3)",
    ">24h incident duration, or >2h downtime for a critical or important function",
    any(
      gt(v("durationMinutes"), 1440),
      all(v("criticalFunction"), gt(v("downtimeMinutes"), 120)),
    ),
    ["durationMinutes", "downtimeMinutes", "criticalFunction"],
  );
  row(
    "geography",
    "Geographical spread",
    "Art. 9(4)",
    "Impact in at least 2 EU Member States",
    v("memberStates") === null
      ? null
      : new Set(v("memberStates")!.filter((x) => EU_STATES.has(x))).size >= 2,
    ["memberStates"],
  );
  const special = v("maliciousAccessPotentialLoss");
  row(
    "data",
    "Data losses",
    "Art. 9(5)",
    "Adverse business or regulatory impact on data; special route for successful malicious unauthorised access under 9(5)(b)",
    any(v("dataAdverseImpact"), special),
    ["dataAdverseImpact", "maliciousAccessPotentialLoss"],
  );
  row(
    "economic",
    "Economic impact",
    "Art. 9(6)",
    "Incurred or likely costs and losses > EUR 100,000",
    gt(v("economicImpact"), 100000),
    ["economicImpact"],
  );
  const groups = criteria.slice(1);
  const metGroups = groups.filter((c) => c.met === true).length;
  const unknownGroups = groups.filter((c) => c.met === null).length;
  const twoGroups: Tri =
    metGroups >= 2 ? true : metGroups + unknownGroups >= 2 ? null : false;
  const result = all(critical, any(special, twoGroups));
  const verdict =
    result === true ? "MAJOR" : result === false ? "NOT_MAJOR" : "INCOMPLETE";
  const missing = [
    ...new Set(
      criteria
        .filter((c) => c.met === null)
        .flatMap((c) =>
          c.keys.filter(
            (k) =>
              f[k].value === null ||
              ((k.startsWith("total") || k.startsWith("daily")) &&
                f[k].value === 0),
          ),
        ),
    ),
  ];
  const explanation =
    verdict === "MAJOR"
      ? special === true
        ? "Critical services affected and Article 9(5)(b) met. Article 8(1)(a) applies."
        : `Critical services affected and ${metGroups} materiality groups met. Article 8(1)(b) applies.`
      : verdict === "NOT_MAJOR"
        ? critical === false
          ? "The Article 6 critical-services gateway is not met."
          : "Fewer than two materiality groups are met, and the Article 9(5)(b) special route is not met."
        : "Missing evidence can change the classification. Complete the highlighted criteria before signing.";
  return {
    verdict,
    ruleVersion: RULE_VERSION,
    criteria,
    metGroups,
    unknownGroups,
    missing,
    explanation,
  };
}
