import { expect, test, type Page } from "@playwright/test";

// Runs after customers.spec and products.spec (files run alphabetically, one worker)
// and uses their data: customers "Ravi Kumar" and "Ravi's brother"; "Steel prop 3 m"
// (85 available, ₹10/day) and "Generator 5 kVA" (G5-001 available).
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
const itemsOut = (page: Page) => page.getByTestId("items-out");

/** A date N days before today in Asia/Kolkata, as YYYY-MM-DD. */
function daysAgo(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}
const ddmmyyyy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;

let orderUrl = "";

test("staff open an order for a customer and issue props and a generator", async ({ page }) => {
  await asStaff(page);
  await main(page).getByRole("link", { name: "New order" }).click();
  await page.getByRole("searchbox").fill("Ravi Kumar");
  await page.getByRole("searchbox").press("Enter");
  await main(page).getByRole("link", { name: /Ravi Kumar/ }).click();
  await expect(page.getByText("#1 Ravi Kumar")).toBeVisible();
  await expect(page.getByLabel("Date")).toHaveCount(0); // staff can't backdate

  await page.getByLabel("Product 1").selectOption({ label: "Steel prop 3 m (PROP-3M) — 85 available" });
  await page.getByLabel("Quantity").fill("20");
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Product 2").selectOption({ label: "Generator 5 kVA — 1 available" });
  await page.getByLabel("G5-001").check();
  await page.getByLabel("Site address").fill("Temple road site, Aluva");
  await page.getByRole("button", { name: "Create order" }).click();

  await ok(page, "Order created");
  await expect(page.getByRole("heading", { name: /^ORD\/\d{4}-\d{2}\/0001$/ })).toBeVisible();
  orderUrl = page.url().replace(/\?.*$/, "");
  await expect(itemsOut(page).locator("li")).toHaveCount(2);
  await expect(itemsOut(page)).toContainText("Steel prop 3 m");
  await expect(itemsOut(page)).toContainText("Out: 20");
  await expect(itemsOut(page)).toContainText("G5-001");
  await expect(itemsOut(page)).toContainText("₹10.00/day");
});

test("adding more items later; can't take more than is available", async ({ page }) => {
  await asStaff(page);
  await page.goto(orderUrl);
  await page.getByLabel("Product 1").selectOption({ label: "Steel prop 3 m (PROP-3M) — 65 available" });
  await page.getByLabel("Quantity").fill("66");
  // The browser enforces max=available; bypass it to prove the server checks too.
  await page.getByLabel("Quantity").evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await page.getByRole("button", { name: "Issue items" }).click();
  await fail(page, "Only 65 Steel prop 3 m available");

  await page.getByLabel("Quantity").fill("5");
  await page.getByRole("button", { name: "Issue items" }).click();
  await ok(page, "Items issued");
  await expect(itemsOut(page).locator("li")).toHaveCount(3);

  // Staff don't get the admin correction forms.
  await expect(page.getByRole("button", { name: "Void" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Cancel order" })).toHaveCount(0);
});

test("stock, customer page and the customer guard reflect the rental", async ({ page }) => {
  await asStaff(page);
  await page.goto("/products");
  await expect(main(page).getByRole("link", { name: /Steel prop 3 m/ })).toContainText("60"); // 85 − 25
  await page.goto("/customers/1");
  await expect(page.getByTestId("customer-orders")).toContainText("ORD/");
  await expect(page.getByTestId("customer-orders")).toContainText("26 pieces out");
  await expect(page.getByTestId("customer-items-out")).toContainText("G5-001");
  await page.getByRole("button", { name: "Deactivate customer" }).click();
  await expect(page.locator("p[role=alert]").filter({ hasText: "This customer has an open order" })).toBeVisible();
});

test("admin voids a wrong line (stock goes back); cancel needs all lines voided", async ({ page }) => {
  await asAdmin(page);
  await page.goto(orderUrl);
  await page.getByLabel("Line").selectOption({ label: `Steel prop 3 m × 5 · ${ddmmyyyy(daysAgo(0))}` });
  await page.getByLabel("Reason").first().fill("Entered by mistake");
  await page.getByRole("button", { name: "Void" }).click();
  await ok(page, "Line voided");
  await expect(itemsOut(page).locator("li")).toHaveCount(2);
  await expect(main(page).getByText("Voided by Shop Manager: “Entered by mistake”")).toBeVisible();

  await page.getByLabel("Reason").last().fill("Testing cancel");
  await page.getByRole("button", { name: "Cancel order" }).click();
  await fail(page, "2 lines are still active — void them first");

  await page.goto("/products");
  await expect(main(page).getByRole("link", { name: /Steel prop 3 m/ })).toContainText("65");
});

test("admin enters a past rental (backdated) and it is marked and audited", async ({ page }) => {
  const past = daysAgo(3);
  await asAdmin(page);
  await page.goto("/orders/new?customer=2");
  await page.getByLabel("Product 1").selectOption({ label: "Steel prop 3 m (PROP-3M) — 65 available" });
  await page.getByLabel("Quantity").fill("10");
  await page.getByLabel("Date").fill(past);
  await page.getByLabel("Notes").fill("Paper register no. 457");
  await page.getByRole("button", { name: "Create order" }).click();
  await ok(page, "Order created");
  await expect(page.getByRole("heading", { name: /\/0002$/ })).toBeVisible();
  await expect(main(page).getByText(`Opened ${ddmmyyyy(past)}`)).toBeVisible();
  await expect(main(page).getByText("backdated", { exact: true })).toBeVisible();
  await expect(main(page).getByText("BACKDATE", { exact: true })).toBeVisible();

  // A future date is refused by the server even if the browser limit is bypassed.
  await page.goto("/orders/new?customer=2");
  await page.getByLabel("Date").evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await page.getByLabel("Date").fill(daysAgo(-2));
  await page.getByRole("button", { name: "Create order" }).click();
  await fail(page, "The date can't be in the future");
});

test("an order entered by mistake can be cancelled and shows under Cancelled", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/orders/new?customer=2");
  await page.getByRole("button", { name: "Create order" }).click(); // no items
  await ok(page, "Order created");
  await page.getByLabel("Reason").fill("Opened twice");
  await page.getByRole("button", { name: "Cancel order" }).click();
  // The form disappears once the order is no longer open; the banner and status show the result.
  await expect(main(page).getByText("Cancelled", { exact: true }).first()).toBeVisible();
  await expect(main(page).getByText("Cancelled by Shop Manager")).toBeVisible();

  await page.goto("/orders"); // "All" is the default
  await expect(page.getByTestId("order-table").locator("tbody tr")).toHaveCount(3);
  await main(page).getByRole("link", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("order-table").locator("tbody tr")).toHaveCount(2); // the two open ones
  await main(page).getByRole("link", { name: "Cancelled", exact: true }).click();
  await expect(page.getByTestId("order-table").locator("tbody tr")).toHaveCount(1);
  await page.goto("/orders?q=457");
  await expect(page.getByTestId("order-table").locator("tbody tr")).toHaveCount(0); // notes aren't searched…
  await page.goto("/orders?q=2");
  await expect(page.getByTestId("order-table").locator("tbody tr")).toHaveCount(1); // …but the order number's last digits are
});

test("stock check still agrees after issues and voids", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products/reconcile");
  await expect(page.getByText("All 2 products agree with their history.")).toBeVisible();
});
