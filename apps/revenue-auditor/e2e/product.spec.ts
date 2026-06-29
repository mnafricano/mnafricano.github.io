import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("visitor can reach and understand the complete demo", async ({ page }) => {
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: /Find the money/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Explore the product demo/i }).click();
  await expect(
    page.getByRole("heading", { name: /Good afternoon/i }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Open" }).click();
  await expect(page.getByText("Potentially recoverable")).toBeVisible();
  await expect(page.locator(".finding-card")).toHaveCount(13);
});

test("auth surface explains its launch configuration safely", async ({
  page,
}) => {
  await page.goto("./login/");
  await expect(
    page.getByRole("heading", { name: /Sign in to continue/i }),
  ).toBeVisible();
  await expect(page.getByText(/not connected to Supabase yet/i)).toBeVisible();
});

test("completed signup form enables account creation", async ({ page }) => {
  await page.goto("./login/?mode=signup");
  await page.getByLabel("Full name").fill("Taylor Morgan");
  await page.getByLabel("Email address").fill("taylor@example.com");
  await page.getByLabel(/Password/).fill("correct-horse-battery-staple");
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeEnabled();
});

test("mobile product has no horizontal overflow", async ({ page }) => {
  await page.goto("./app/?demo=1");
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scroll).toBe(dimensions.client);
});

test("public and product surfaces have no serious accessibility violations", async ({
  page,
}) => {
  for (const path of ["./", "./login/", "./app/?demo=1"]) {
    await page.goto(path);
    await page.locator(".spinner").waitFor({ state: "hidden" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(
      results.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact || ""),
      ),
    ).toEqual([]);
  }
});
