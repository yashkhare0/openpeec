import { expect, test } from "@playwright/test";

test("dashboard shell loads and prompts workspace is reachable", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Toggle Sidebar" }).click();
  await page.getByRole("button", { name: "Prompts" }).click();

  await expect(
    page
      .getByText("Loading analytics data...")
      .or(page.getByPlaceholder("Search prompts..."))
  ).toBeVisible({
    timeout: 15_000,
  });
});
