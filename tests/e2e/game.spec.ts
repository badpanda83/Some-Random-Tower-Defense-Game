import { expect, test, type Locator } from "@playwright/test";

async function tapBattlefieldPad(
  canvas: Locator,
  position: { readonly x: number; readonly y: number },
  touch: boolean,
): Promise<void> {
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  const scaledPosition = {
    x: ((bounds?.width ?? 960) * position.x) / 960,
    y: ((bounds?.height ?? 540) * position.y) / 540,
  };
  if (touch) {
    await canvas.tap({ position: scaledPosition });
  } else {
    await canvas.click({ position: scaledPosition });
  }
}

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

test("previews, confirms, and safely cancels touch-friendly placement", async ({
  page,
}, testInfo) => {
  const touch = testInfo.project.name === "mobile-chromium";
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const canvas = page.locator("canvas");
  const gold = page.locator(".resource-gold strong");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: /Fork Knight/ }).click();
  await expect(gold).toHaveText("270");

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await expect(page.getByText("Placement preview")).toBeVisible();
  await expect(page.getByText("Deploy for 60 gold")).toBeVisible();
  await expect(gold).toHaveText("270");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Placement preview")).not.toBeVisible();
  await expect(gold).toHaveText("270");

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await page.getByRole("button", { name: "Confirm 60g" }).click();
  await expect(page.getByText(/Hero inspection/)).toBeVisible();
  await expect(gold).toHaveText("210");
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(page.getByText("Wave in progress")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Pause battle" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Pause battle" }).click();

  await page.getByRole("button", { name: /Discount Wizard/ }).click();
  await expect(
    page.getByRole("button", {
      name: "Dismiss message",
    }),
  ).toHaveText("Discount Wizard selected. Tap an empty pad.");
  await tapBattlefieldPad(canvas, { x: 245, y: 250 }, touch);
  await expect(page.getByText("Deploy for 100 gold")).toBeVisible();
  await expect(gold).toHaveText("210");
  await page.getByRole("button", { name: "Confirm 100g" }).click();
  await expect(page.getByText(/Merl-ish · rank 1/)).toBeVisible();
  await expect(gold).toHaveText("110");

  await page.getByRole("button", { name: "Upgrade 80g" }).click();
  await expect(page.getByText(/Merl-ish · rank 2/)).toBeVisible();
  await expect(gold).toHaveText("30");

  await page.getByRole("button", { name: /Bardbarian/ }).click();
  await tapBattlefieldPad(canvas, { x: 285, y: 448 }, touch);
  await expect(page.getByText(/need 60 more/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm 90g" }),
  ).toBeDisabled();
  await expect(gold).toHaveText("30");
  await page.getByRole("button", { name: "Cancel" }).click();

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await expect(page.getByText(/Sir Stabs-a-Lot · rank 1/)).toBeVisible();
  await expect(gold).toHaveText("30");
  await expect(page.getByText("Wave in progress")).toBeVisible();
});
