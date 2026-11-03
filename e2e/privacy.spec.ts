import { test, expect } from "@playwright/test";

test("privacy follow-up remains usable after the DORA final report", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", {
      name: "Urgent payments are not reaching settlement",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign classification", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm classification" }).click();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  for (const [stage, reference] of [
    ["initial", "NCA-PRIV-1"],
    ["intermediate", "NCA-PRIV-2"],
    ["final", "NCA-PRIV-3"],
  ]) {
    await page.getByLabel("Report stage", { exact: true }).selectOption(stage!);
    await page.getByRole("button", { name: "Record submission" }).click();
    await page.getByLabel("Authority receipt reference").fill(reference!);
    await page
      .getByRole("button", { name: "Record receipt", exact: true })
      .click();
    await expect(page.getByText(reference!, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("button", { name: "Record submission" }),
  ).toBeDisabled();
  for (const [button, value] of [
    ["Edit personal-data breach", "true"],
    ["Edit privacy risk assessment", "false"],
  ]) {
    await page.getByRole("button", { name: button!, exact: true }).click();
    await page
      .getByLabel("Recorded value", { exact: true })
      .selectOption(value!);
    await page.getByRole("button", { name: "Save evidence" }).click();
  }
  await page.getByRole("button", { name: "Edit incident context" }).click();
  await expect(page.getByLabel("Financial entity identifier")).toBeDisabled();
  await page
    .getByLabel("Personal-data-breach awareness time", { exact: true })
    .fill("2026-10-29T11:00");
  await page.getByRole("button", { name: "Save incident context" }).click();
  await page.getByLabel("Report stage", { exact: true }).selectOption("gdpr");
  await expect(
    page.getByRole("button", { name: "Record submission" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Record submission" }).click();
  await page.getByLabel("Authority receipt reference").fill("DPA-PRIV-1");
  await page
    .getByRole("button", { name: "Record receipt", exact: true })
    .click();
  await expect(page.getByText("DPA-PRIV-1", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Evidence trail/ }).click();
  await expect(page.getByText("✓ CHAIN CONSISTENT")).toBeVisible();
});
