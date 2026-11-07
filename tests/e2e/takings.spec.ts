import { expect, test, type Page } from "@playwright/test";

// Runs after settlement.spec (alphabetical, one worker) and uses its orders:
//   ORD/…/0001 (Ravi Kumar): open, ₹1,700.00 so far, nothing paid.
//   ORD/…/0002: closed with live invoice INV/…/0003, total ₹300.00, nothing paid.
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
const summary = (page: Page) => page.getByTestId("money-summary");

async function openOrder(page: Page, no: string) {
  await page.goto(`/orders?status=all&q=${no}`);
  await main(page).getByRole("link", { name: new RegExp(`/${no.padStart(4, "0")}`) }).click();
  await expect(page).toHaveURL(/\/orders\/\d+$/);
}

test("staff take an advance on an open order; the statement and receipt show it", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  await expect(page.getByText("Before the final invoice, any amount can be taken")).toBeVisible();
  await page.getByLabel("Amount (₹)").fill("500");
  await page.getByRole("button", { name: "Save and print receipt" }).click();

  await ok(page, "Payment recorded — receipt RCP/");
  await expect(page.getByTestId("payments")).toContainText("Advance · Cash");
  await expect(page.getByTestId("statement-totals")).toContainText("Received− ₹500.00");
  await expect(page.getByTestId("statement-totals")).toContainText("Balance due₹1,200.00");

  const receipt = page.locator("p[role=status]").getByRole("link", { name: "Print" });
  const href = await receipt.getAttribute("href");
  await page.goto(href!);
  await expect(page.locator("main.slip")).toContainText("രസീത് Receipt");
  await expect(page.locator("main.slip")).toContainText("₹500.00");
  await expect(page.locator("main.slip")).toContainText("പണം / Cash");
});

test("after the invoice, a payment can't exceed the balance; cheques need a number", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "2");
  await expect(page.getByText("Balance due: ₹300.00")).toBeVisible();

  await page.getByLabel("Amount (₹)").fill("350");
  await page.getByRole("button", { name: "Save and print receipt" }).click();
  await fail(page, "Only ₹300.00 is due on this order");

  await page.getByLabel("Amount (₹)").fill("300");
  await page.getByLabel("Paid by").selectOption("CHEQUE");
  await page.getByRole("button", { name: "Save and print receipt" }).click();
  await expect(page.getByText("Enter the cheque number")).toBeVisible();

  await page.getByLabel("Paid by").selectOption("UPI");
  await page.getByLabel(/Reference/).fill("UPI-778812");
  await page.getByRole("button", { name: "Save and print receipt" }).click();
  await ok(page, "Payment recorded");
  await expect(summary(page)).toContainText("Fully paid");
  await expect(page.getByRole("button", { name: "Save and print receipt" })).toHaveCount(0);
  await expect(page.getByText("Void a payment")).toHaveCount(0); // admin only
});

test("admin voids a payment, reissues with a discount, and the excess is refunded", async ({ page }) => {
  await asAdmin(page);
  await openOrder(page, "2");
  await page.getByLabel("Payment", { exact: true }).selectOption({ index: 0 });
  await page.getByLabel("Reason", { exact: true }).last().fill("Wrong order");
  await page.getByRole("button", { name: "Void payment" }).click();
  await ok(page, "Payment voided");
  await expect(summary(page)).toContainText("Balance due₹300.00");

  await page.getByLabel("Amount (₹)").fill("300");
  await page.getByRole("button", { name: "Save and print receipt" }).click();
  await ok(page, "Payment recorded");

  // Cancel and reissue with ₹100 off → ₹200 total, ₹100 paid in excess.
  await page.getByTestId("closed-notice").getByRole("link").click();
  await page.getByLabel("Reason for cancelling").fill("Agreed discount");
  await page.getByLabel("Discount (₹)").fill("100");
  await page.getByLabel("Reason for the discount").fill("Long-time customer");
  await page.getByRole("button", { name: "Cancel and reissue" }).click();
  await expect(page.getByTestId("invoice-money")).toContainText("Excess paid₹100.00");

  await page.getByRole("link", { name: /ORD\/.*\/0002/ }).click();
  await expect(page.getByText("The customer paid ₹100.00 more than the invoice")).toBeVisible();
  const refund = page.locator("form").filter({ has: page.getByRole("button", { name: "Record refund" }) });
  await refund.getByLabel("Amount (₹)").fill("150");
  await refund.getByRole("button", { name: "Record refund" }).click();
  await fail(page, "can't be more than the excess of ₹100.00");
  await refund.getByLabel("Amount (₹)").fill("100");
  await refund.getByRole("button", { name: "Record refund" }).click();
  await ok(page, "Refund recorded — voucher RFD/");
  await expect(summary(page)).toContainText("Fully paid");
  await expect(page.getByRole("button", { name: "Record refund" })).toHaveCount(0);
});

test("the Payments page shows the day's collections per mode", async ({ page }) => {
  await asStaff(page);
  await page.goto("/payments");
  const totals = page.getByTestId("day-totals");
  await expect(totals).toContainText("Cash₹800.00₹100.00"); // in: ₹500 advance + ₹300 payment; out: ₹100 cash refund
  await expect(page.getByTestId("day-payments").locator("li")).toHaveCount(4); // incl. the voided UPI and the refund
  await expect(main(page)).toContainText("Net: ₹700.00"); // 500 + 300 − 100 refund (voided UPI excluded)
});

test("the customer page shows what is outstanding across orders", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  await main(page).getByRole("link", { name: /Ravi Kumar/ }).first().click();
  await expect(page.getByTestId("customer-outstanding")).toContainText("Open orders so far (rent to today − advances)₹1,200.00");
});

test("invoice and statement print as bilingual slips, and download as PDF", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "2");
  const inv = page.getByTestId("closed-notice").getByRole("link");
  const invHref = await inv.getAttribute("href");
  const invoiceId = invHref!.split("/").pop();

  await page.goto(`/print/invoice/${invoiceId}`);
  const slip = page.locator("main.slip");
  await expect(slip).toContainText("ഇൻവോയ്സ് Invoice");
  await expect(slip).toContainText("കിഴിവ് Discount");
  await expect(slip).toContainText("₹200.00");

  await openOrder(page, "1");
  await expect(page).toHaveURL(/\/orders\/\d+$/);
  const orderId = page.url().split("/").pop();
  await page.goto(`/print/statement/${orderId}`);
  await expect(page.locator("main.slip")).toContainText("സ്റ്റേറ്റ്മെന്റ് Statement");
  await expect(page.locator("main.slip")).toContainText("₹1,200.00");

  const pdf = await page.request.get(`/api/pdf/invoice/${invoiceId}`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect(pdf.headers()["content-disposition"]).toMatch(/INV-\d{4}-\d{2}-0004\.pdf/);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});

test("signed-out users can't fetch a PDF", async ({ request }) => {
  const res = await request.get("/api/pdf/invoice/1", { maxRedirects: 0 });
  expect([302, 303, 307, 401, 403]).toContain(res.status());
});
