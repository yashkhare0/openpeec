import { expect, test } from "@playwright/test";

test("dashboard shell loads and prompts workspace is reachable", async ({
  page,
}) => {
  await page.goto("/");

  await page
    .getByRole("main")
    .getByRole("button", { name: "Toggle Sidebar" })
    .click();
  await page.getByRole("button", { name: "Prompts" }).click();

  await expect(page.getByRole("button", { name: "New prompt" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("columnheader", { name: "Prompt" })
  ).toBeVisible();
});
