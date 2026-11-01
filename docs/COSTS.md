# Cost controls

The shipped policy is `config/billing-protection.json`: `kind: unverified`. `npm run deploy:forge` refuses to deploy in that state. No Forge registration or metered deployment was completed during this build.

## Free replay

The standalone replay is a static build. It uses browser-local storage and deterministic rules, with no paid model, cloud function, database service, analytics, scheduled job or external hosting account. Running it locally creates no cloud usage. Public GitHub Pages serves the same replay from a compiled branch. CI runs only in public repositories on a standard Ubuntu runner, with no artifact uploads or cache storage. This avoids shared Actions artifact-storage billing.

## Why a missing card is insufficient

Forge's [pricing](https://developer.atlassian.com/platform/forge/forge-platform-pricing/) bills usage above the free allowances, including development environments. Its [Developer Space billing rules](https://developer.atlassian.com/platform/forge/developer-space/billing-for-developer-spaces/) describe overages and pre-dunning even when no valid payment method is present. The [platform limits](https://developer.atlassian.com/platform/forge/platform-quotas-and-limits/) page says the former usage quotas were retired. Budget alerts provide notification rather than a verified stop at zero cost.

The current documentation exempts usage in up to five eligible sandbox sites associated with a production site. A normal developer test site is not evidence of that exemption. An eligible sandbox or a provider-enforced spending cap must be verified before the deployment policy is changed.

## Deployment gate

```sh
npm run deploy:forge
```

This checks for an explicit provider protection type, an HTTPS evidence URL, a verification timestamp and an unexpired verification period before invoking the Forge CLI. A person can edit source files or run the CLI directly; this local safeguard does not control Atlassian's billing platform. The actual zero-billing protection must come from the provider or from leaving the metered app undeployed.

The Forge adapter has no paid LLM calls, containers, SQL instance, object store, scheduled trigger, public web trigger or backend egress permission. Rovo and the connector are optional integrations. Their Forge invocations still fall under platform usage billing, so they are covered by the same deployment gate.

## Scope

This policy governs this project's deployment. Existing apps and subscriptions in the Developer Space have their own usage and billing state.
