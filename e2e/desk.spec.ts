import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Urgent payments are not reaching settlement",
    }),
  ).toBeVisible();
});
test("sign, prepare, submit, update, export and verify", async ({ page }) => {
  await page
    .getByRole("button", { name: "Sign classification", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm classification" }).click();
  await expect(
    page.getByText("Classification signed.", { exact: false }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Record submission" }).click();
  await page.getByLabel("Authority receipt reference").fill("ACPR-DEMO-001");
  await page
    .getByRole("button", { name: "Record receipt", exact: true })
    .click();
  await expect(page.getByText("ACPR-DEMO-001", { exact: true })).toBeVisible();
  await page
    .getByLabel("Report stage", { exact: true })
    .selectOption("intermediate");
  await page.getByRole("button", { name: "Record submission" }).click();
  await page.getByLabel("Authority receipt reference").fill("ACPR-DEMO-002");
  await page
    .getByRole("button", { name: "Record receipt", exact: true })
    .click();
  await expect(page.getByText("ACPR-DEMO-002", { exact: true })).toBeVisible();
  await page
    .getByLabel("Review a proposed narrative")
    .fill("999999 clients affected [affectedClients].");
  await page.getByRole("button", { name: "Check against evidence" }).click();
  await expect(
    page.getByText(/Unsupported values or citations: 999999/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Evidence trail/ }).click();
  await expect(page.getByText("✓ CHAIN VERIFIED")).toBeVisible();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export workpaper", exact: false })
    .first()
    .click();
  expect((await download).suggestedFilename()).toBe("four-hours-fh-482.md");
});
test("edit evidence, preserve nulls, refuse incomplete signing", async ({
  page,
}) => {
  await page.getByRole("button", { name: /FH-483/ }).click();
  await expect(
    page.getByText("Evidence incomplete", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign classification", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: /Clients & transactions/ }).click();
  await page
    .getByRole("button", { name: /Edit Affected clients/i, exact: true })
    .click();
  await page.getByLabel("Recorded value").fill("140");
  await page.getByRole("button", { name: "Save evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Major incident", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sign classification", exact: true }),
  ).toBeEnabled();
});
test("recurrence and graph exploration", async ({ page }) => {
  await page.getByRole("button", { name: /FH-476/ }).click();
  await page
    .getByRole("button", { name: "Check recurring incidents", exact: false })
    .click();
  await expect(
    page.getByText("FH-476 + FH-441", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use combined evidence" }).click();
  await expect(
    page.getByRole("heading", { name: "Major incident", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /FH-482/ }).click();
  await page
    .getByRole("button", { name: "Service context", exact: true })
    .click();
  await page.getByRole("button", { name: /Adapter 2.8.1/ }).click();
  await expect(
    page.getByText("Released 08:32 CET · time correlation, cause unconfirmed", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sync technical services", exact: false })
    .click();
  await expect(
    page.getByText(/connector runs in the Forge installation/),
  ).toBeVisible();
});
test("reset, clock advance, search and add unknown incident", async ({
  page,
}) => {
  await page.getByLabel("Find an incident").fill("status page");
  await expect(page.getByRole("button", { name: /FH-481/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /FH-482/ })).toHaveCount(0);
  await page.getByLabel("Find an incident").fill("");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Advance 2 hours" }).click();
  await expect(page.getByText("29 Oct, 13:08 Paris time")).toBeVisible();
  await page.getByRole("button", { name: "Reset synthetic replay" }).click();
  await page
    .getByRole("button", { name: "Add incident", exact: false })
    .click();
  await page.getByLabel("Jira incident key").fill("INC-900");
  await page
    .getByLabel("Affected service", { exact: true })
    .fill("Customer portal");
  await page.getByRole("button", { name: "Add incident", exact: true }).click();
  await expect(
    page.getByText("Evidence incomplete", { exact: true }),
  ).toBeVisible();
});
test("accessibility across all four sections and signature dialog", async ({
  page,
}) => {
  const reports = [];
  for (const name of [
    "Classification",
    "Service context",
    "Reports",
    "Evidence trail",
  ]) {
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    reports.push({ section: name, violations: result.violations });
  }
  await page
    .getByRole("button", { name: "Classification", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sign classification", exact: true })
    .click();
  const modal = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  reports.push({ section: "Signature dialog", violations: modal.violations });
  await mkdir("eval/reports", { recursive: true });
  await writeFile(
    "eval/reports/accessibility.json",
    JSON.stringify(reports, null, 2),
  );
  expect(
    reports
      .flatMap((r) => r.violations)
      .map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`),
  ).toEqual([]);
});
test("mobile layout and real product captures", async ({ page }) => {
  await mkdir("../gallery/raw", { recursive: true });
  await page.screenshot({
    path: "../gallery/raw/03-incident-desk.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Service context", exact: true })
    .click();
  await page.screenshot({
    path: "../gallery/raw/05-service-context.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Classification", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "../gallery/raw/mobile.png", fullPage: true });
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(result.violations).toEqual([]);
});

test("incident context and GDPR evidence stay distinct", async ({ page }) => {
  await page.getByRole("button", { name: "Edit incident context" }).click();
  await page
    .getByLabel("Apparent root cause")
    .fill("Settlement adapter memory leak");
  await page
    .getByLabel("Personal-data-breach awareness time")
    .fill("2026-10-29T10:30");
  await page.getByRole("button", { name: "Save incident context" }).click();
  await expect(
    page.getByText("Evidence updated.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Data losses/ }).click();
  await expect(
    page.getByText(
      "Adverse business or regulatory impact on data; special route for successful malicious unauthorised access under 9(5)(b)",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Evidence trail", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Incident context updated" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await page.getByRole("button", { name: "Edit personal-data breach" }).click();
  await page.getByLabel("Recorded value").fill("true");
  await page.getByRole("button", { name: "Save evidence" }).click();
  await page
    .getByRole("button", { name: "Edit privacy risk assessment" })
    .click();
  await page.getByLabel("Recorded value").fill("false");
  await page.getByRole("button", { name: "Save evidence" }).click();
  await expect(
    page.getByText("GDPR notification", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("01 Nov, 10:30", { exact: true })).toBeVisible();
});

test("invalid evidence remains visible in its dialog and can be corrected", async ({
  page,
}) => {
  await page.getByRole("button", { name: /Clients & transactions/ }).click();
  await page
    .getByRole("button", { name: /Edit Affected clients/i, exact: true })
    .click();
  await page.getByLabel("Recorded value").fill("-1");
  await page.getByRole("button", { name: "Save evidence" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
  await page.getByLabel("Recorded value").fill("18400");
  await page.getByRole("button", { name: "Save evidence" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("standalone replay makes no external service calls", async ({ page }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).origin !== new URL(page.url()).origin)
      external.push(r.url());
  });
  await page.reload();
  await page
    .getByRole("button", { name: "Service context", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Refresh graph evidence", exact: false })
    .click();
  await expect(
    page.getByText(
      "Graph enrichment runs in Forge after the synthetic service register is connected and synced.",
    ),
  ).toBeVisible();
  expect(external).toEqual([]);
});
