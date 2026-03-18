import { expect, test } from "@playwright/test";

test("dashboard shell loads and prompts workspace is reachable", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("OpenPeec")).toBeVisible();

  await page.getByRole("button", { name: "Prompts" }).click();

  await expect(page.getByPlaceholder("Search prompts...")).toBeVisible();
  await expect(page.getByRole("button", { name: "New prompt" })).toBeVisible();
});
