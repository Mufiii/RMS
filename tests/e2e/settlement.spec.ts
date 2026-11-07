import { expect, test, type Page } from "@playwright/test";

// Runs after returns.spec (alphabetical, one worker) and uses its orders:
//   ORD/…/0001: 16 Steel props (₹10/day) and Generator G5-001 (₹1,500/day) still out, all issued today;
//               4 props came back good today.
//   ORD/…/0002: everything back — 10 props for 3 days = ₹300.00.
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
const main = (page: Page) => page.locator("main");
const ok = (page: Page, text: string) => expect(page.locator("p[role=status]").filter({ hasText: text })).toBeVisible();
const fail = (page: Page, text: string) => expect(page.locator("p[role=alert]").filter({ hasText: text })).toBeVisible();
const totals = (page: Page) => page.getByTestId("invoice-totals");

async function openOrder(page: Page, no: string) {
  await page.goto(`/orders?status=all&q=${no}`);
  await main(page).getByRole("link", { name: new RegExp(`/${no.padStart(4, "0")}`) }).click();
}

test("the running statement shows rent so far, with rent on items still out counted to today", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  const s = page.getByTestId("statement");
  await expect(s).toContainText("Steel prop 3 m × 16");
  await expect(s).toContainText("16 × ₹10.00 × 1 day = ₹160.00");
  await expect(s).toContainText("1 × ₹1,500.00 × 1 day = ₹1,500.00");
  await expect(page.getByTestId("statement-totals")).toContainText("Total so far₹1,700.00"); // 160 + 1500 + 40 returned
  // Items are still out, so there is no final invoice yet.
  await expect(page.getByRole("button", { name: "Generate final invoice" })).toHaveCount(0);
});

test("staff generate the final invoice (no discount for staff); the order closes", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "2");
  await expect(page.getByText("ready for the final invoice")).toBeVisible();
  await expect(page.getByLabel("Discount (₹)")).toHaveCount(0);
  await page.getByRole("button", { name: "Generate final invoice" }).click();

  await expect(page).toHaveURL(/\/invoices\/\d+\?saved=created$/);
  await ok(page, "Final invoice generated");
  await expect(page.getByRole("heading", { name: /^INV\/\d{4}-\d{2}\/0001$/ })).toBeVisible();
  await expect(page.getByTestId("invoice-lines")).toContainText("10 × ₹10.00 × 3 days");
  await expect(totals(page)).toContainText("Total₹300.00");
  await expect(page.getByText("Cancel invoice", { exact: true })).toHaveCount(0); // admin only

  await page.getByRole("link", { name: /ORD\/.*\/0002/ }).click();
  await expect(page.getByTestId("closed-notice")).toContainText("Closed with final invoice INV/");
  await expect(page.getByTestId("closed-notice")).toContainText("₹300.00");
  await expect(page.getByRole("button", { name: "Record return" })).toHaveCount(0);
});

test("admin cancels and reissues with a discount: new number, old one kept as cancelled", async ({ page }) => {
  await asAdmin(page);
  await openOrder(page, "2");
  await page.getByTestId("closed-notice").getByRole("link").click();

  await page.getByLabel("Reason for cancelling").fill("Agreed discount");
  await page.getByLabel("Discount (₹)").fill("50");
  await page.getByRole("button", { name: "Cancel and reissue" }).click();
  await fail(page, "Give a reason for the discount");

  await page.getByLabel("Reason for the discount").fill("Regular customer");
  await page.getByRole("button", { name: "Cancel and reissue" }).click();
  await expect(page).toHaveURL(/\?saved=reissued$/);
  await ok(page, "The old invoice was cancelled");
  await expect(page.getByRole("heading", { name: /\/0002$/ })).toBeVisible();
  await expect(totals(page)).toContainText("Subtotal₹300.00");
  await expect(totals(page)).toContainText("“Regular customer”");
  await expect(totals(page)).toContainText("Total₹250.00");

  await page.getByRole("link", { name: /ORD\/.*\/0002/ }).click();
  const list = page.getByTestId("order-invoices");
  await expect(list.locator("li")).toHaveCount(2);
  await expect(list.locator("li").filter({ hasText: "/0001" })).toContainText("Cancelled — “Agreed discount”");
  await expect(list.locator("li").filter({ hasText: "/0002" })).toContainText("₹250.00");
  await expect(main(page)).toContainText("INVOICE_DISCOUNT");
});

test("admin cancels and re-opens the order, then a new invoice; discount limits are checked", async ({ page }) => {
  await asAdmin(page);
  await openOrder(page, "2");
  await page.getByTestId("closed-notice").getByRole("link").click();
  await page.getByLabel("Reason for cancelling").fill("Return date was wrong");
  await page.getByRole("button", { name: "Cancel and re-open order" }).click();

  await expect(page).toHaveURL(/\/orders\/\d+\?saved=invoiceCancelled$/);
  await ok(page, "Invoice cancelled. The order is open again.");
  await expect(page.getByText("Void a return", { exact: true })).toBeVisible(); // returns can be corrected now

  await page.getByLabel("Discount (₹)").fill("300.01");
  await page.getByLabel("Reason for the discount").fill("Too much");
  await page.getByRole("button", { name: "Generate final invoice" }).click();
  await fail(page, "The discount can't be more than ₹300.00");

  await page.getByLabel("Discount (₹)").fill("");
  await page.getByLabel("Reason for the discount").fill("");
  await page.getByRole("button", { name: "Generate final invoice" }).click();
  await expect(page.getByRole("heading", { name: /\/0003$/ })).toBeVisible();
  await expect(totals(page)).toContainText("Total₹300.00");
});

test("cancelled invoices still open from the order and show who cancelled them", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "2");
  await page.getByTestId("order-invoices").getByRole("link", { name: /\/0001$/ }).click();
  await expect(page.getByTestId("cancelled-notice")).toContainText("Cancelled by Shop Manager");
  await expect(totals(page)).toContainText("Total₹300.00"); // reprinted exactly as issued
});
