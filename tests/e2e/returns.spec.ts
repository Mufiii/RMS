import { expect, test, type Page } from "@playwright/test";

// Runs after rentals.spec (alphabetical, one worker) and uses its orders:
//   ORD/…/0001 (Ravi Kumar): Steel prop × 20 and Generator G5-001, issued today
//   ORD/…/0002 (Ravi's brother): Steel prop × 10, issued 3 days ago (backdated), ₹10/day
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
const line = (page: Page, label: string) => page.getByTestId("return-lines").locator("li").filter({ hasText: label });
const history = (page: Page) => page.getByTestId("returns-history");

function daysAgo(n: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

async function openOrder(page: Page, no: string) {
  await page.goto(`/orders?status=all&q=${no}`);
  await main(page).getByRole("link", { name: new RegExp(`/${no.padStart(4, "0")}`) }).click();
}

test("staff record a mixed return: good, damaged (charged) and lost (charged), plus a damaged generator", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  await expect(page.getByLabel("Return date")).toHaveCount(0); // staff can't backdate

  const props = line(page, "Steel prop 3 m");
  await props.getByLabel("Good").fill("12");
  await props.getByLabel("Damaged").fill("3");
  await props.getByLabel(/Damage charge/).fill("150");
  await props.getByLabel(/What is damaged/).fill("Bent");
  await props.getByLabel("Lost").fill("1");
  await props.getByLabel(/Loss charge/).fill("800");
  await props.getByLabel(/Note on the loss/).fill("Missing at site");
  const gen = line(page, "Generator 5 kVA G5-001");
  await gen.getByLabel("Damaged").check();
  await gen.getByLabel(/What is damaged/).fill("Starter broken");
  await page.getByRole("button", { name: "Record return" }).click();

  await ok(page, "Return recorded");
  await expect(page.getByTestId("items-out").locator("li")).toHaveCount(1);
  await expect(page.getByTestId("items-out")).toContainText("Out: 4");
  await expect(history(page)).toContainText("Steel prop 3 m × 12");
  await expect(history(page)).toContainText("1 day · rent ₹120.00"); // 12 × ₹10 × 1 day
  await expect(history(page)).toContainText("charge ₹150.00");
  await expect(history(page)).toContainText("“Missing at site”");
  await expect(history(page)).toContainText("Generator 5 kVA G5-001");
});

test("the server refuses returning more than is out", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  const props = line(page, "Steel prop 3 m");
  await props.getByLabel("Good").evaluate((el: HTMLInputElement) => el.removeAttribute("max"));
  await props.getByLabel("Good").fill("5");
  await page.getByRole("button", { name: "Record return" }).click();
  await fail(page, "Only 4 of Steel prop 3 m are out");
});

test("stock moved: damaged to repair, lost written off, generator under repair", async ({ page }) => {
  await asStaff(page);
  await page.goto("/products");
  await main(page).getByRole("link", { name: /Steel prop 3 m/ }).click();
  // Before: owned 95, out 30, repair 10. Returned 12 good + 3 damaged + 1 lost.
  await expect(main(page).getByText("Returned damaged").first()).toBeVisible();
  await expect(main(page).getByText("Lost on rental").first()).toBeVisible();
  await page.goto("/products?q=G5-001");
  await main(page).getByRole("link", { name: /Generator 5 kVA/ }).click();
  await expect(main(page).locator("li").filter({ hasText: "G5-001" }).first()).toContainText("Under repair");
});

test("'all back in good condition' finishes the order", async ({ page }) => {
  await asStaff(page);
  await openOrder(page, "1");
  await page.getByRole("button", { name: "All back in good condition" }).click();
  await expect(line(page, "Steel prop 3 m").getByLabel("Good")).toHaveValue("4");
  await page.getByRole("button", { name: "Record return" }).click();
  await ok(page, "Everything on this order has been returned");
  await expect(page.getByText("Nothing is out on this order.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Record return" })).toHaveCount(0);
});

test("admin voids a wrong return: items go back out and stock is reversed", async ({ page }) => {
  await asAdmin(page);
  await openOrder(page, "1");
  await page.getByLabel("Return", { exact: true }).selectOption({ index: 0 }); // the first (mixed) return
  await page.getByLabel("Reason", { exact: true }).first().fill("Counted wrongly");
  await page.getByRole("button", { name: "Void return" }).click();
  await ok(page, "Return voided");
  await expect(page.getByText("Everything on this order has been returned")).toHaveCount(0);
  await expect(page.getByTestId("items-out")).toContainText("Out: 16");
  await expect(page.getByTestId("items-out")).toContainText("G5-001");
  await expect(history(page)).toContainText("Voided by Shop Manager: “Counted wrongly”");
});

test("admin records a backdated return; rent counts the right days; not before the issue date", async ({ page }) => {
  await asAdmin(page);
  await openOrder(page, "2");
  const props = line(page, "Steel prop 3 m");

  await props.getByLabel("Good").fill("10");
  await page.getByLabel("Return date").fill(daysAgo(4));
  await page.getByRole("button", { name: "Record return" }).click();
  await fail(page, "was issued on");

  await props.getByLabel("Good").fill("10");
  await page.getByLabel("Return date").fill(daysAgo(1));
  await page.getByRole("button", { name: "Record return" }).click();
  await ok(page, "Everything on this order has been returned");
  // Issued 3 days ago, returned yesterday → 3 calendar days inclusive: 10 × ₹10 × 3.
  await expect(history(page)).toContainText("3 days · rent ₹300.00");
  await expect(history(page)).toContainText("backdated");
});

test("stock check agrees after returns and a voided return", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products/reconcile");
  await expect(page.getByText("All 2 products agree with their history.")).toBeVisible();
});
