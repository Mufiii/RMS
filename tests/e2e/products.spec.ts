import { expect, test, type Page } from "@playwright/test";

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
const tile = (page: Page, label: string) => main(page).locator("div.rounded-xl.border.p-3").filter({ hasText: label }).locator("div").nth(1);
const ok = (page: Page, text: string) => expect(page.locator("p[role=status]").filter({ hasText: text })).toBeVisible();
const fail = (page: Page, text: string) => expect(page.locator("p[role=alert]").filter({ hasText: text })).toBeVisible();

test("admin sets up categories", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products/new");
  await expect(page.getByText("No categories yet")).toBeVisible();
  await page.goto("/products/categories");
  const add = main(page).locator("form").first();
  await add.getByPlaceholder("Name", { exact: true }).fill("Scaffolding");
  await add.getByPlaceholder("Name in Malayalam").fill("സ്കാഫോൾഡിംഗ്");
  await add.getByRole("button", { name: "Add" }).click();
  await ok(page, "Category added");
  await add.getByPlaceholder("Name", { exact: true }).fill("Generators");
  await add.getByRole("button", { name: "Add" }).click();
  await expect(main(page).locator("li")).toHaveCount(2);
  // Names are unique regardless of case.
  await add.getByPlaceholder("Name", { exact: true }).fill("SCAFFOLDING");
  await add.getByRole("button", { name: "Add" }).click();
  await fail(page, 'A category named "SCAFFOLDING" already exists');
});

test("quantity product: opening stock, repair, write-off and their limits", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products/new");
  await page.getByLabel("Category").selectOption({ label: "Scaffolding" });
  await page.getByLabel("Code").fill("prop-3m");
  await page.getByLabel("Name", { exact: true }).fill("Steel prop 3 m");
  await page.getByLabel("Daily rate (₹)").fill("8");
  await page.getByLabel("Opening stock (quantity)").fill("100");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Product added")).toBeVisible();
  await expect(main(page).getByText("PROP-3M")).toBeVisible();
  await expect(tile(page, "Owned")).toHaveText("100");
  await expect(tile(page, "Available")).toHaveText("100");

  await page.getByLabel("Type").selectOption("SENT_TO_REPAIR");
  await page.getByLabel("Quantity").fill("10");
  await page.getByRole("button", { name: "Record" }).click();
  await ok(page, "Stock updated");
  await expect(tile(page, "In repair")).toHaveText("10");
  await expect(tile(page, "Available")).toHaveText("90");

  await page.getByLabel("Type").selectOption("WRITE_OFF");
  await page.getByLabel("Quantity").fill("95");
  await page.getByLabel("Reason").fill("Rusted");
  await page.getByRole("button", { name: "Record" }).click();
  await fail(page, "Only 90 available");

  await page.getByLabel("Quantity").fill("5");
  await page.getByLabel("Reason").fill("Rusted");
  await page.getByRole("button", { name: "Record" }).click();
  await ok(page, "Stock updated");
  await expect(tile(page, "Owned")).toHaveText("95");
  await expect(tile(page, "Available")).toHaveText("85");
  await expect(main(page).getByText("“Rusted”")).toBeVisible();
});

test("rate change is audited and tracking is locked once there is stock", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products");
  await main(page).getByRole("link", { name: /Steel prop 3 m/ }).click();
  await main(page).getByRole("link", { name: "Edit product" }).click();
  await expect(page.getByText("Can't be changed once the product has stock history.")).toBeVisible();
  await expect(page.getByLabel("Tracking")).toBeDisabled();
  await page.getByLabel("Daily rate (₹)").fill("10");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(tile(page, "Daily rate")).toHaveText("₹10.00");
  await expect(main(page).getByText("₹8.00 → ₹10.00")).toBeVisible();
});

test("serialised product: units, repair, write-off, duplicate serials", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products/new");
  await page.getByLabel("Category").selectOption({ label: "Generators" });
  await page.getByLabel("Name", { exact: true }).fill("Generator 5 kVA");
  await page.getByLabel("Tracking").selectOption("SERIALISED");
  await page.getByLabel("Daily rate (₹)").fill("1500");
  await page.getByLabel("Serial numbers").fill("G5-001\nG5-002");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Product added")).toBeVisible();
  await expect(tile(page, "Owned")).toHaveText("2");
  await expect(main(page).locator("ul li").filter({ hasText: "G5-001" }).first()).toContainText("Available");

  await page.getByLabel("Serial numbers").fill("G5-003\ng5-001");
  await page.getByRole("button", { name: "Add units" }).click();
  await fail(page, 'Serial "g5-001" already exists for this product');
  await page.getByLabel("Serial numbers").fill("G5-003");
  await page.getByRole("button", { name: "Add units" }).click();
  await ok(page, "1 unit added");
  await expect(tile(page, "Owned")).toHaveText("3");

  await page.getByLabel("Unit", { exact: true }).selectOption({ label: "G5-002 — Available" });
  await page.getByLabel("Action").selectOption("SENT_TO_REPAIR");
  await page.getByRole("button", { name: "Record" }).click();
  await ok(page, "Unit updated");
  await expect(tile(page, "In repair")).toHaveText("1");
  await expect(main(page).locator("li").filter({ hasText: "G5-002" }).first()).toContainText("Under repair");

  await page.getByLabel("Unit", { exact: true }).selectOption({ label: "G5-003 — Available" });
  await page.getByLabel("Action").selectOption("WRITE_OFF");
  await page.getByRole("button", { name: "Record" }).click();
  // The reason becomes required for a write-off, so the browser blocks the submit.
  await expect(page.getByLabel("Reason")).toHaveJSProperty("validity.valueMissing", true);
  await expect(tile(page, "Owned")).toHaveText("3");
  await page.getByLabel("Reason").fill("Stolen from site");
  await page.getByRole("button", { name: "Record" }).click();
  await ok(page, "Unit updated");
  await expect(tile(page, "Owned")).toHaveText("2");
  await expect(tile(page, "Available")).toHaveText("1");
});

test("stock check agrees with history", async ({ page }) => {
  await asAdmin(page);
  await page.goto("/products");
  await main(page).getByRole("link", { name: "Stock check" }).click();
  await expect(page.getByText("All 2 products agree with their history.")).toBeVisible();
});

test("staff see availability but can't change products or stock", async ({ page }) => {
  await asStaff(page);
  await page.locator("aside").getByRole("link", { name: "Products" }).click();
  await expect(main(page).getByRole("link", { name: "New product" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: /Steel prop 3 m/ })).toContainText("85");
  await main(page).getByRole("link", { name: /Steel prop 3 m/ }).click();
  await expect(tile(page, "Available")).toHaveText("85");
  await expect(page.getByRole("button", { name: "Record" })).toHaveCount(0);
  await expect(main(page).getByRole("link", { name: "Edit product" })).toHaveCount(0);
  for (const path of ["/products/new", "/products/categories", "/products/reconcile", "/products/1/edit"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/forbidden$/);
  }
});

test("search by serial number and filter by category", async ({ page }) => {
  await asStaff(page);
  await page.goto("/products?q=g5-003");
  await expect(main(page).locator("ul li")).toHaveCount(1);
  await expect(main(page).locator("ul")).toContainText("Generator 5 kVA");
  await page.goto("/products");
  await page.getByLabel("Category").selectOption({ label: "Scaffolding" });
  await page.getByRole("button", { name: "Search" }).click();
  await expect(main(page).locator("ul li")).toHaveCount(1);
  await expect(main(page).locator("ul")).toContainText("Steel prop 3 m");
});
