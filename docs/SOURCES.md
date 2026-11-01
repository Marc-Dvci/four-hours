# Rule and platform sources

Reviewed 1 November 2026. Primary sources control the rule implementation.

| Source                                                                                                                                           | Applied in                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| [Delegated Regulation (EU) 2024/1772](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32024R1772), Articles 1 to 9                   | `src/core/classify.ts`, `src/core/recurrence.ts`                                                   |
| [Delegated Regulation (EU) 2025/301](https://eur-lex.europa.eu/eli/reg_del/2025/301/oj/eng), Articles 1 to 5                                     | `src/core/clocks.ts`, `src/core/report-details.ts`                                                 |
| [Implementing Regulation (EU) 2025/302](https://eur-lex.europa.eu/eli/reg_impl/2025/302/oj/eng), Annexes                                         | Officer-reviewed draft coverage in `src/core/reports.ts`; not full conditional template validation |
| [Regulation (EEC, Euratom) 1182/71](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A31971R1182), Article 3(2)(c)                     | Corresponding calendar date, end of local day for the one-month period                             |
| [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj/eng), Article 33(1)                                                                         | Separate breach-awareness clock, with an unlikely-risk exception                                   |
| [Forge Custom UI bridge](https://developer.atlassian.com/platform/forge/apis-reference/ui-api-bridge/invoke/)                                    | `src/frontend/client.ts`                                                                           |
| [Teamwork Graph connector](https://developer.atlassian.com/platform/forge/manifest-reference/modules/teamwork-graph-connector/)                  | `manifest.yml`, `src/forge/graph.ts`                                                               |
| [Connector requirements](https://developer.atlassian.com/platform/teamwork-graph/connector-requirements-and-best-practices/)                     | Explicit projection, ingestion-result checks and disconnect cleanup                                |
| [Software service schema](https://developer.atlassian.com/platform/teamwork-graph/connector-reference/object-types-connectors/software-service/) | SDK-typed synthetic technical service objects                                                      |

## Rule interpretation register

- Article 6 has three alternative critical-services routes. Regulated financial services can satisfy the gateway without being an ICT service supporting a critical function.
- Article 9(1) groups all client, financial-counterpart and transaction sub-thresholds into one materiality group.
- Article 9(3)(b)'s two-hour downtime threshold specifically refers to ICT services supporting critical or important functions.
- Article 9(5)(a) adverse data impact is one group. Article 8(1)(a)'s special route references Article 9(5)(b).
- Article 9 thresholds use strict greater-than operators except geography, which uses at least two Member States.
- Article 8(2) combines qualifying recurring incidents. Matching is by managed financial entity and common apparent root cause across services within six calendar months, using occurrence times. A collective incident preserves its source records. People and transaction counts stay unknown without deduplication; disjoint incident costs are an estimate requiring source-level loss review. Only readable managed records are searched; monthly institutional review remains an operational responsibility.
- Article 5(2) of 2025/301 gives a separate four-hour rule when major classification occurs more than 24 hours after awareness.
- Article 5(4) working-day extensions are optional. The engine supports an explicitly supplied holiday policy. The product defaults to the unextended deadline. Article 5(5) excludes specified entities' initial and intermediate reports from the extension.
- A month ends on the corresponding calendar date at the end of the day in the reporting timezone, following 1182/71 Article 3(2)(c), with end-of-month clamping and daylight-saving transitions. Review the competent authority's current form and applicable extensions. GDPR and reclassification never use DORA working-day extensions.
- GDPR has its own awareness time and risk test. Personal data being involved alone does not establish the notification obligation.

## Data boundary

Atlassian's connector terms exclude regulated financial data. The connector projects two fictional software services and generic technical metadata. Customer-impact figures, monetary losses, regulatory classification and signatures remain in Forge storage. Workspace-visible graph objects are explicitly synthetic. Production use requires a customer-approved technical metadata projection under the platform's current terms.
