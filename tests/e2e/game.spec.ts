import { expect, test } from "@playwright/test";

test("installs as a local-first PWA and opens the campaign", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /The Dubious Realm/i }),
  ).toBeVisible();

  const manifest = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifest).toBeTruthy();
  const manifestResponse = await page.request.get(manifest!);
  expect(manifestResponse.ok()).toBe(true);
  expect(await manifestResponse.json()).toMatchObject({
    name: "The Dubious Realm",
    display: "standalone",
  });

  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("heading", {
      name: /realm has selected its cheapest champions/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();

  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /The Dubious Realm/i }),
  ).toBeVisible();
  await context.setOffline(false);
});

test("places a touch-friendly tower and starts combat", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: /Fork Knight/ }).click();

  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({
    position: {
      x: ((bounds?.width ?? 960) * 83) / 960,
      y: ((bounds?.height ?? 540) * 74) / 540,
    },
  });

  await expect(page.getByText(/Hero inspection/)).toBeVisible();
  await expect(page.getByText("210")).toBeVisible();
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(page.getByText("Wave in progress")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause battle" }),
  ).toBeEnabled();
});
