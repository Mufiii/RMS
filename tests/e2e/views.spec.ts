import { expect, test, type Page } from "@playwright/test";

// Runs last on desktop (alphabetical, one worker), after takings.spec. Today's money from it:
//   ₹500 advance (cash) + ₹300 payment (cash) − ₹100 refund (cash) = ₹700 net; a ₹300 UPI payment was voided.
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
const report = (page: Page) => page.getByTestId("report");
const tab = (page: Page, name: string) => main(page).getByRole("navigation", { name: "Reports" }).getByRole("link", { name, exact: true }).click();

function daysAgo(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

test("the dashboard flags a rental out 30+ days and shows today's money", async ({ page }) => {
  await asAdmin(page);
  // A go-live style rental from 34 days ago → day 35 today.
  await page.goto("/orders/new?customer=2");
  await page.getByLabel("Product 1").selectOption({ index: 1 });
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Date").fill(daysAgo(34));
  await page.getByRole("button", { name: "Create order" }).click();
  await expect(page.locator("p[role=status]").filter({ hasText: "Order created" })).toBeVisible();

  await page.goto("/dashboard");
  const long = page.getByTestId("long-rentals").locator("li");
  await expect(long).toHaveCount(1);
  await expect(long.first()).toContainText("Ravi's brother");
  await expect(long.first()).toContainText("35 days");
  await expect(long.first().getByRole("link", { name: /98/ })).toHaveAttribute("href", /^tel:/);
  await expect(page.getByTestId("tile-today")).toContainText("₹700.00");
  await expect(page.getByTestId("tile-out")).toContainText("Items out now");
  await expect(page.getByTestId("week").locator("li")).toHaveCount(7);
  await expect(page.getByTestId("week").locator("li").last()).toContainText("₹700.00");
});

test("reports: inventory, customers, rentals in a date range, payments and collections", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/reports");
  await expect(report(page)).toContainText("Steel prop 3 m");
  await expect(page.getByTestId("report-totals")).toContainText("Total");

  await tab(page, "Customers");
  await expect(report(page).locator("tbody tr").filter({ hasText: "Ravi Kumar" })).toHaveCount(1);

  await tab(page, "Rentals");
  await page.getByLabel("From").fill(daysAgo(40));
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(new RegExp(`from=${daysAgo(40)}`));
  await expect(report(page).locator("tbody tr").filter({ hasText: "Ravi's brother" }).first()).toBeVisible();

  await tab(page, "Payments");
  await expect(page).toHaveURL(/r=payments/);
  await expect(report(page).locator("tbody tr")).toHaveCount(4);
  await expect(report(page).locator("tbody tr.line-through")).toHaveCount(1); // the voided UPI
  await expect(page.getByTestId("report-totals")).toContainText("₹800.00");
  await expect(page.getByTestId("report-totals")).toContainText("₹100.00");

  await tab(page, "Collections");
  await expect(page.getByTestId("report-totals")).toContainText("₹700.00");
});

test("each report downloads as an Excel-ready CSV", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/reports?r=collections");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^collections_\d{4}-\d{2}-\d{2}_to_\d{4}-\d{2}-\d{2}\.csv$/);

  const res = await page.request.get("/api/reports/payments");
  expect(res.headers()["content-type"]).toContain("text/csv");
  const text = (await res.body()).toString("utf8");
  expect(text.charCodeAt(0)).toBe(0xfeff); // BOM so Excel reads ₹ and Malayalam
  const lines = text.slice(1).trim().split("\r\n");
  expect(lines[0]).toBe("Date,Receipt,Type,Mode,Customer,Order,Reference,In,Out,Status,By");
  expect(lines.at(-1)).toContain(",800.00,100.00,"); // totals row: plain numbers, not ₹-formatted
  expect(lines.some((l) => l.includes("Voided"))).toBe(true);
});

test("staff have no dashboard or reports, not even the CSV", async ({ page }) => {
  await asStaff(page);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/forbidden$/);
  await page.goto("/reports");
  await expect(page).toHaveURL(/\/forbidden$/);
  const res = await page.request.get("/api/reports/customers");
  expect(res.status()).toBe(403);
});
