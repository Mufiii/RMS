import { expect, test, type Page } from "@playwright/test";

// Runs last on desktop (alphabetical, after views.spec), because it changes settings
// that earlier specs depend on. views.spec left one rental out for 35 days.
test.describe.configure({ mode: "serial" });

async function login(page: Page, username: string, password: string, home: RegExp) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(home);
}
const asAdmin = (page: Page) => login(page, "manager", "manager-pass", /\/dashboard$/);
const asStaff = (page: Page) => login(page, "counter", "counter-pass", /\/orders$/);
const ok = (page: Page, text: string) => expect(page.locator("p[role=status]").filter({ hasText: text })).toBeVisible();
// A real 1×1 PNG.
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test("admin edits business details and the long-rental threshold; the dashboard follows", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/settings");
  await expect(page.getByLabel("Invoices", { exact: true })).toHaveValue("INV");
  await expect(page.getByText(/^INV\/\d{4}-\d{2}\/0001$/)).toBeVisible(); // live example of the next number

  // Two documents can't share a prefix (receipts and refunds share one number series).
  await page.getByLabel("Refunds", { exact: true }).fill("rcp");
  await expect(page.getByText(/^RCP\/\d{4}-\d{2}\/0001$/).first()).toBeVisible(); // typed lower-case, shown upper-case
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Each document needs its own prefix")).toBeVisible();

  await page.getByLabel("Refunds", { exact: true }).fill("RFD");
  await page.getByLabel("Business name (Malayalam)").fill("ശ്രീ കൃഷ്ണ മോട്ടോഴ്സ്");
  await page.getByLabel("Phone numbers").fill("98470 12345");
  await page.getByLabel("Long rental after (days)").fill("40");
  await page.getByRole("button", { name: "Save settings" }).click();
  await ok(page, "Settings saved");

  await page.goto("/dashboard");
  await expect(page.getByText("Long rentals: 40+ days out")).toBeVisible();
  await expect(page.getByText("Nothing has been out 40 days or more.")).toBeVisible(); // the 35-day rental is no longer flagged
});

test("logo: only real PNG/JPEG files are accepted, and it prints on slips", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/settings");
  await expect(page.getByText("No logo yet.")).toBeVisible();

  await page.getByLabel("Image file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from("<svg onload=alert(1)>") });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await expect(page.locator("p[role=alert]").filter({ hasText: "must be a PNG or JPEG" })).toBeVisible(); // name and type lie; the bytes don't

  await page.getByLabel("Image file").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG_1PX });
  await page.getByRole("button", { name: "Upload logo" }).click();
  await ok(page, "Logo saved");
  await expect(page.getByTestId("logo-preview")).toBeVisible();

  const logo = await page.request.get((await page.getByTestId("logo-preview").getAttribute("src"))!);
  expect(logo.headers()["content-type"]).toBe("image/png");
  expect(logo.headers()["x-content-type-options"]).toBe("nosniff");

  await page.goto("/payments");
  const receipt = page.getByTestId("day-payments").getByRole("link").first();
  await page.goto((await receipt.getAttribute("href"))!);
  await expect(page.locator("main.slip img.logo")).toBeVisible();
  await expect(page.locator("main.slip h1")).toHaveText("ശ്രീ കൃഷ്ണ മോട്ടോഴ്സ്");
  await expect(page.locator("main.slip")).toContainText("98470 12345");

  await page.goto("/settings");
  await page.getByRole("button", { name: "Remove logo" }).click();
  await ok(page, "Logo removed");
  await expect(page.getByText("No logo yet.")).toBeVisible();
});

test("staff can't open Settings, and signed-out visitors can't fetch the logo", async ({ page, request }) => {
  await asStaff(page);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/forbidden$/);
  const res = await request.get("/api/logo", { maxRedirects: 0 });
  expect([302, 303, 307, 401]).toContain(res.status());
});
