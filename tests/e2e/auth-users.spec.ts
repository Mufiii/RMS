import { expect, test, type Page } from "@playwright/test";

// One story, in order: first admin login → create staff → staff login → permissions → deactivation.
test.describe.configure({ mode: "serial" });

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

/** Logs in and waits until the app has redirected away from /login. */
async function loginOk(page: Page, username: string, password: string) {
  await login(page, username, password);
  await expect(page).not.toHaveURL(/\/login$/);
}

test("signed-out visitors are sent to the login page", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/login$/);
});

test("wrong password shows an error", async ({ page }) => {
  await login(page, "admin", "not-the-password");
  await expect(page.locator("p[role=alert]")).toHaveText("Wrong username or password");
});

test("first admin login forces a password change, then lands on the dashboard", async ({ page }) => {
  await login(page, "admin", "admin-initial");
  await expect(page).toHaveURL(/\/change-password$/);
  // Can't skip it by navigating away.
  await page.goto("/users");
  await expect(page).toHaveURL(/\/change-password$/);

  await page.getByLabel("Current password").fill("admin-initial");
  await page.getByLabel("New password", { exact: true }).fill("admin-strong-1");
  await page.getByLabel("Confirm new password").fill("admin-strong-1");
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("admin creates a staff user; staff must change password and gets staff-only access", async ({ page, browser }) => {
  await loginOk(page, "admin", "admin-strong-1");
  await page.getByRole("link", { name: "Users" }).first().click();
  await page.getByRole("link", { name: "New user" }).click();
  await page.getByLabel("Full name").fill("Anu Krishnan");
  await page.getByLabel("Username").fill("anu");
  await page.getByLabel("Initial password").fill("anu-temp-1");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("User created")).toBeVisible();

  // Duplicate username is refused with a clear message.
  await page.goto("/users/new");
  await page.getByLabel("Full name").fill("Another Anu");
  await page.getByLabel("Username").fill("ANU");
  await page.getByLabel("Initial password").fill("anu-temp-2");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator("p[role=alert]")).toContainText('"anu" is already taken');

  // Staff logs in from another device.
  const staffCtx = await browser.newContext();
  const staff = await staffCtx.newPage();
  await login(staff, "anu", "anu-temp-1");
  await expect(staff).toHaveURL(/\/change-password$/);
  await staff.getByLabel("Current password").fill("anu-temp-1");
  await staff.getByLabel("New password", { exact: true }).fill("anu-strong-1");
  await staff.getByLabel("Confirm new password").fill("anu-strong-1");
  await staff.getByRole("button", { name: "Change password" }).click();
  await expect(staff).toHaveURL(/\/orders$/);

  // Staff see no admin menu items and are refused admin pages.
  const nav = staff.locator("aside nav");
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  for (const path of ["/users", "/dashboard", "/audit", "/settings", "/reports"]) {
    await staff.goto(path);
    await expect(staff).toHaveURL(/\/forbidden$/);
  }

  // Admin deactivates the staff user → their open session ends at once.
  await page.goto("/users");
  await page.getByRole("link", { name: "Anu Krishnan" }).click();
  await page.getByLabel("Reason").fill("Left the job");
  await page.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByText("User deactivated")).toBeVisible();

  await staff.goto("/orders");
  await expect(staff).toHaveURL(/\/login$/);
  await login(staff, "anu", "anu-strong-1");
  await expect(staff.locator("p[role=alert]")).toHaveText("Wrong username or password");
  await staffCtx.close();

  // Everything above is in the audit log.
  await page.goto("/audit");
  for (const action of ["USER_DEACTIVATE", "PASSWORD_CHANGE", "USER_CREATE"]) {
    await expect(page.getByText(action, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("“Left the job”")).toBeVisible();
});

test("an admin cannot deactivate or demote themselves", async ({ page }) => {
  await loginOk(page, "admin", "admin-strong-1");
  await page.goto("/users");
  await page.getByRole("link", { name: "Shop Owner" }).click();
  await expect(page.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  await expect(page.getByLabel("Role")).toBeDisabled();
});

test("language switch shows Malayalam and is remembered", async ({ page }) => {
  await loginOk(page, "admin", "admin-strong-1");
  await page.locator("aside").getByRole("button", { name: "മലയാളം" }).click();
  await expect(page.getByRole("heading", { name: "ഡാഷ്ബോർഡ്" })).toBeVisible();
  await page.reload();
  await expect(page.locator("aside").getByRole("link", { name: "ഉപയോക്താക്കൾ" })).toBeVisible();
  await page.locator("aside").getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
