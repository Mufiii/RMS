import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

async function loginStaff(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill("counter");
  await page.getByLabel("Password").fill("counter-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/orders$/);
}

const main = (page: Page) => page.locator("main");
const rows = (page: Page) => page.getByTestId("customer-table").locator("tbody tr");

test("staff add a customer and see their details page", async ({ page }) => {
  await loginStaff(page);
  await page.locator("aside").getByRole("link", { name: "Customers" }).click();
  await expect(page.getByText("No customers yet")).toBeVisible();
  await main(page).getByRole("link", { name: "New customer" }).first().click();

  await page.getByLabel("Name").fill("Ravi Kumar");
  await page.getByLabel("Phone", { exact: true }).fill("+91 98470-12345");
  await page.getByLabel("Address").fill("Near temple, Aluva");
  await page.getByLabel("ID proof", { exact: true }).selectOption("AADHAAR");
  await page.getByLabel("ID proof number").fill("1234 5678 9012");
  await page.getByRole("button", { name: "Create" }).click();

  await expect(page).toHaveURL(/\/customers\/1\?saved=created$/);
  await expect(page.getByText("Customer added")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ravi Kumar" })).toBeVisible();
  await expect(main(page).getByText("98470 12345")).toBeVisible(); // stored normalised, shown grouped
  await expect(main(page).getByText("Aadhaar · 1234 5678 9012")).toBeVisible();
  await expect(main(page).getByText("CUSTOMER_CREATE")).toBeVisible();
});

test("validation errors keep the typed values", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill("Bad Phone");
  await page.getByLabel("Phone", { exact: true }).fill("12");
  await page.getByLabel("ID proof number").fill("XYZ");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Enter a valid phone number (6–15 digits)")).toBeVisible();
  await expect(page.getByText("Choose the ID proof type")).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Bad Phone");
});

test("a phone number already in use needs confirmation", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers/new");
  await page.getByLabel("Name").fill("Ravi's brother");
  await page.getByLabel("Phone", { exact: true }).fill("098470 12345"); // same number, typed differently
  await page.getByRole("button", { name: "Create" }).click();

  const warning = page.locator("div[role=alert]").filter({ hasText: "already used" });
  await expect(warning).toContainText("already used by the customer(s) below");
  await expect(warning.getByRole("link", { name: "#1 Ravi Kumar" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Ravi's brother");

  // Submitting again without ticking the box still doesn't save.
  await page.getByRole("button", { name: "Create" }).click();
  await expect(warning).toBeVisible();

  await page.getByLabel("It's a different person — save anyway").check();
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/customers\/2\?saved=created$/);
});

test("search by name, phone and customer number; an unknown phone offers a prefilled new customer", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers");
  const search = page.getByRole("searchbox");
  const list = page.getByTestId("customer-table");

  await search.fill("brother");
  await search.press("Enter");
  await expect(list.locator("tbody tr")).toHaveCount(1);
  await expect(list).toContainText("Ravi's brother");

  await search.fill("98470 12345");
  await search.press("Enter");
  await expect(list.locator("tbody tr")).toHaveCount(2);

  await search.fill("#1");
  await search.press("Enter");
  await expect(list.locator("tbody tr")).toHaveCount(1);
  await expect(list).toContainText("Ravi Kumar");

  await search.fill("9999911111");
  await search.press("Enter");
  await expect(page.getByText("No customers match “9999911111”.")).toBeVisible();
  await main(page).getByRole("link", { name: "New customer" }).last().click();
  await expect(page.getByLabel("Phone", { exact: true })).toHaveValue("9999911111");
});

test("edit a customer; the change is recorded", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers/1");
  await main(page).getByRole("link", { name: "Edit customer" }).click();
  await page.getByLabel("Alternate phone").fill("0484 234 5678");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page).toHaveURL(/\/customers\/1\?saved=updated$/);
  await expect(page.getByText("Changes saved")).toBeVisible();
  await expect(main(page).getByText("04842345678")).toBeVisible();
  await expect(main(page).getByText("CUSTOMER_UPDATE")).toBeVisible();
});

test("deactivated customers move to the Inactive filter and can be reactivated", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers/2");
  await page.getByLabel("Reason (optional)").fill("Duplicate entry");
  await page.getByRole("button", { name: "Deactivate customer" }).click();
  await expect(page.locator("p[role=status]").filter({ hasText: "Customer deactivated" })).toBeVisible();

  await page.goto("/customers"); // "All" is the default
  await expect(rows(page)).toHaveCount(2);
  await main(page).getByRole("link", { name: "Active", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await main(page).getByRole("link", { name: "Inactive", exact: true }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByTestId("customer-table")).toContainText("Ravi's brother");

  await page.goto("/customers/2");
  await page.getByRole("button", { name: "Reactivate customer" }).click();
  await expect(page.locator("p[role=status]").filter({ hasText: "Customer reactivated" })).toBeVisible();
});

test("summary cards and the ⋮ menu; staff cannot delete", async ({ page }) => {
  await loginStaff(page);
  await page.goto("/customers");
  await expect(page.getByTestId("card-customers")).toContainText("2");
  await expect(page.getByTestId("card-active")).toContainText("None inactive");
  await expect(page.getByTestId("card-rentals")).toContainText("0");
  await expect(page.getByTestId("card-outstanding")).toContainText("₹0.00");
  await expect(rows(page).first()).toContainText("Active");

  await page.getByRole("button", { name: "Actions for Ravi Kumar" }).click();
  await expect(page.getByRole("menuitem", { name: "View details" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete customer" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Edit customer" }).click();
  await expect(page).toHaveURL(/\/customers\/1\/edit$/);
});

test("admin deletes a customer with no history after confirming", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill("manager");
  await page.getByLabel("Password").fill("manager-pass");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/customers/new");
  await page.getByLabel("Name").fill("Typo Entry");
  await page.getByLabel("Phone", { exact: true }).fill("9847055555");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page).toHaveURL(/\/customers\/\d+\?saved=created$/);

  await page.goto("/customers");
  await expect(rows(page)).toHaveCount(3);
  const openDelete = async () => {
    await page.getByRole("button", { name: "Actions for Typo Entry" }).click();
    await page.getByRole("menuitem", { name: "Delete customer" }).click();
  };
  await openDelete();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Delete Typo Entry?");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(rows(page)).toHaveCount(3);

  await openDelete();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Customer deleted")).toBeVisible();
  await expect(rows(page)).toHaveCount(2);
  await expect(page.getByTestId("customer-table")).not.toContainText("Typo Entry");
});

test("customer pages work in Malayalam", async ({ page }) => {
  await loginStaff(page);
  await page.locator("aside").getByRole("button", { name: "മലയാളം" }).click();
  await expect(page.locator("aside").getByRole("link", { name: "ഉപഭോക്താക്കൾ" })).toBeVisible();
  await page.goto("/customers/1");
  await expect(main(page).getByText("വാടക ചരിത്രം")).toBeVisible();
  await expect(main(page).getByText("ആധാർ · 1234 5678 9012")).toBeVisible();
  await page.locator("aside").getByRole("button", { name: "English" }).click();
});
