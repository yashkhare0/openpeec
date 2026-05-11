import { expect, test } from "@playwright/test";

test("nodriver fixture HTML is served with a stable title", async ({
  page,
}) => {
  await page.goto("/nodriver-fixture.html");
  await expect(page).toHaveTitle("OpenPeec Nodriver Fixture");
  await expect(page.getByRole("textbox", { name: "Prompt" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /send prompt/i })
  ).toBeVisible();
});
