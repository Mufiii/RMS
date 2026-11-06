import { expect, test } from "@playwright/test";

test("mobile layout uses a bottom navigation bar", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("admin");
  await page.getByLabel("Password").fill("admin-strong-1");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await expect(page.locator("aside")).toBeHidden();
  const bottom = page.locator("nav.fixed");
  await expect(bottom.getByRole("link", { name: "Orders" })).toBeVisible();

  await bottom.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Users" }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();
});
