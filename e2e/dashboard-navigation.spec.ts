import { expect, test } from "@playwright/test";

const navPages = [
  "Overview",
  "Prompts",
  "Providers",
  "Runs",
  "Responses",
  "Sources",
] as const;

test.describe("dashboard navigation (live Convex)", () => {
  test.skip(
    process.env.OPENPEEC_E2E_LIVE === "0",
    "Set OPENPEEC_E2E_LIVE=1 for dashboard tests (default in playwright.config)."
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  for (const label of navPages) {
    test(`${label} nav updates the header breadcrumb`, async ({ page }) => {
      await page.getByRole("button", { name: label }).click();
      await expect(page.getByRole("banner")).toContainText(label, {
        timeout: 45_000,
      });
    });
  }

  test("prompts workspace loads table chrome", async ({ page }) => {
    await page.getByRole("button", { name: "Prompts" }).click();
    await expect(
      page.getByRole("button", { name: "New prompt" })
    ).toBeVisible({ timeout: 45_000 });
    await expect(
      page.getByRole("columnheader", { name: "Prompt" })
    ).toBeVisible();
  });

  test("URL encodes prompts page selection", async ({ page }) => {
    await page.getByRole("button", { name: "Prompts" }).click();
    await expect(page).toHaveURL(/[?&]page=prompts/, { timeout: 45_000 });
  });

  test("runs page shows primary layout regions", async ({ page }) => {
    await page.getByRole("button", { name: "Runs" }).click();
    await expect(page.getByRole("banner")).toContainText("Runs", {
      timeout: 45_000,
    });
    await expect(page.getByRole("main")).toBeVisible();
  });
});
