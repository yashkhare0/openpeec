import { expect, test } from "@playwright/test";

test("dashboard shell loads and prompts workspace is reachable", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("OpenPeec")).toBeVisible();
  await expect(page.getByText("Visibility Lab")).toBeVisible();

  await expect(
    page
      .getByText("Visibility Command Center")
      .or(page.getByText("No response analytics yet"))
  ).toBeVisible();

  await page.getByRole("button", { name: "Prompts" }).click();

  await expect(
    page.getByPlaceholder("Search prompts, sources, or entities...")
  ).toBeVisible();
  await expect(
    page.getByText(
      "Select a prompt to inspect its response history, source mix, and brand/entity mentions."
    )
  ).toBeVisible();
});
