export type Protection = {
  kind: "unverified" | "atlassian-hard-cap" | "billing-exempt-sandbox";
  evidenceUrl?: string;
  verifiedAt?: string;
  expiresAt?: string;
};
export function requireBillingProtection(
  protection: Protection,
  now: string,
): void {
  if (
    !["atlassian-hard-cap", "billing-exempt-sandbox"].includes(protection.kind)
  )
    throw new Error(
      "Forge deployment is blocked: no verified hard billing protection is configured. Use the free static replay.",
    );
  if (
    !protection.evidenceUrl?.startsWith("https://") ||
    !protection.verifiedAt ||
    !protection.expiresAt
  )
    throw new Error(
      "Billing protection needs provider evidence and a verification period",
    );
  if (
    !Number.isFinite(Date.parse(now)) ||
    !Number.isFinite(Date.parse(protection.verifiedAt)) ||
    Date.parse(protection.verifiedAt) > Date.parse(now) ||
    !Number.isFinite(Date.parse(protection.expiresAt)) ||
    Date.parse(protection.expiresAt) <= Date.parse(now)
  )
    throw new Error("Billing protection is expired or invalid");
}
