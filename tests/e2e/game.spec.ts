import { expect, test, type Locator, type Page } from "@playwright/test";

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

async function placeTower(
  page: Page,
  canvas: Locator,
  towerName: RegExp,
  position: { readonly x: number; readonly y: number },
): Promise<void> {
  await page
    .getByRole("button", { name: towerName })
    .click({ timeout: 10_000 });
  await tapBattlefieldPad(canvas, position, false);
  await page.getByRole("button", { name: /Confirm \d+g/ }).click();
}

async function upgradeTower(
  page: Page,
  canvas: Locator,
  position: { readonly x: number; readonly y: number },
): Promise<void> {
  await tapBattlefieldPad(canvas, position, false);
  await page.getByRole("button", { name: /Upgrade \d+g/ }).click();
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
  test.setTimeout(45_000);
  const touch = testInfo.project.name === "mobile-chromium";
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const canvas = page.locator(".battlefield canvas");
  const gold = page.locator(".resource-gold strong");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: /Fork Knight/ }).click();
  await expect(gold).toHaveText("270");

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await expect(page.getByText("Placement preview")).toBeVisible();
  await expect(page.getByText("Deploy for 57 gold")).toBeVisible();
  await expect(gold).toHaveText("270");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Placement preview")).not.toBeVisible();
  await expect(gold).toHaveText("270");

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await page.getByRole("button", { name: "Confirm 57g" }).click();
  await expect(page.getByText(/Hero inspection/)).toBeVisible();
  await expect(gold).toHaveText("213");
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
  await expect(page.getByText("Deploy for 95 gold")).toBeVisible();
  await expect(gold).toHaveText("213");
  await page.getByRole("button", { name: "Confirm 95g" }).click();
  await expect(page.getByText(/Merl-ish · rank 1/)).toBeVisible();
  await expect(gold).toHaveText("118");

  await page.getByRole("button", { name: "Upgrade 76g" }).click();
  await expect(page.getByText(/Merl-ish · rank 2/)).toBeVisible();
  await expect(gold).toHaveText("42");

  await page.getByRole("button", { name: /Bardbarian/ }).click();
  await tapBattlefieldPad(canvas, { x: 285, y: 448 }, touch);
  await expect(page.getByText(/need 43 more/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm 85g" }),
  ).toBeDisabled();
  await expect(gold).toHaveText("42");
  await page.getByRole("button", { name: "Cancel" }).click();

  await tapBattlefieldPad(canvas, { x: 83, y: 74 }, touch);
  await expect(page.getByText(/Sir Stabs-a-Lot · rank 1/)).toBeVisible();
  await expect(gold).toHaveText("42");
  await expect(page.getByText("Wave in progress")).toBeVisible();
});

test("keeps campaign portrait-friendly and explains battle orientation", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Begin defense" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const orientation = page.getByText(
    "Turn your phone sideways to defend the moat",
  );
  await expect(orientation).toBeVisible();
  await expect(
    page.getByText(/Battle resumes automatically when your phone is sideways/),
  ).toBeVisible();

  await page.setViewportSize({ width: 568, height: 320 });
  await expect(orientation).not.toBeVisible();
  const canvas = page.locator("canvas");
  const forkKnight = page.getByRole("button", { name: /Fork Knight/ });
  const ability = page.getByRole("button", { name: "Arm Forkfall" });
  const leave = page.getByRole("button", { name: "Leave mission" });
  const startWave = page.getByRole("button", { name: "Start wave 1" });
  for (const [name, control] of [
    ["battlefield", canvas],
    ["tower", forkKnight],
    ["ability", ability],
    ["leave", leave],
    ["wave", startWave],
  ] as const) {
    await expect(control).toBeVisible();
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(
      (box?.x ?? -1) + (box?.width ?? 569),
      `${name} right edge`,
    ).toBeLessThanOrEqual(568);
    expect(
      (box?.y ?? -1) + (box?.height ?? 321),
      `${name} bottom edge`,
    ).toBeLessThanOrEqual(320);
  }
  const waveBox = await startWave.boundingBox();
  expect(waveBox?.height).toBeGreaterThanOrEqual(44);

  await forkKnight.click();
  await tapBattlefieldPad(
    canvas,
    { x: 83, y: 74 },
    testInfo.project.name === "mobile-chromium",
  );
  const confirm = page.getByRole("button", { name: "Confirm 57g" });
  await expect(confirm).toBeVisible();
  const confirmBox = await confirm.boundingBox();
  expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (confirmBox?.y ?? -1) + (confirmBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  await confirm.click();
  const upgrade = page.getByRole("button", { name: "Upgrade 52g" });
  await expect(upgrade).toBeVisible();
  const upgradeBox = await upgrade.boundingBox();
  expect(upgradeBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (upgradeBox?.y ?? -1) + (upgradeBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
});

test("persists a completed victory and unlocks Mimic Market offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(300_000);
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Full victory flow runs once on desktop.",
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(page.locator(".sync-pill")).toContainText("synced");
  await page.getByRole("button", { name: "Begin defense" }).click();

  const canvas = page.locator(".battlefield canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Change game speed" }).click();
  await expect(
    page.getByRole("button", { name: "Change game speed" }),
  ).toHaveText("2×");

  await placeTower(page, canvas, /Discount Wizard/, { x: 245, y: 250 });
  await placeTower(page, canvas, /Fork Knight/, { x: 472, y: 249 });
  await placeTower(page, canvas, /Fork Knight/, { x: 713, y: 270 });
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(page.getByRole("button", { name: "Start wave 2" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, canvas, { x: 245, y: 250 });
  await page.getByRole("button", { name: "Start wave 2" }).click();
  await expect(page.getByRole("button", { name: "Start wave 3" })).toBeVisible({
    timeout: 30_000,
  });

  await placeTower(page, canvas, /Discount Wizard/, { x: 858, y: 300 });
  await page.getByRole("button", { name: "Start wave 3" }).click();
  await expect(page.getByRole("button", { name: "Start wave 4" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, canvas, { x: 245, y: 250 });
  await upgradeTower(page, canvas, { x: 858, y: 300 });
  await page.getByRole("button", { name: "Start wave 4" }).click();
  await expect(page.getByRole("button", { name: "Start wave 5" })).toBeVisible({
    timeout: 30_000,
  });

  await placeTower(page, canvas, /Bardbarian/, { x: 782, y: 474 });
  await upgradeTower(page, canvas, { x: 472, y: 249 });
  await page.getByRole("button", { name: "Start wave 5" }).click();
  await expect(page.getByRole("button", { name: "Start wave 6" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, canvas, { x: 858, y: 300 });
  await placeTower(page, canvas, /Discount Wizard/, { x: 285, y: 448 });
  await page.getByRole("button", { name: "Start wave 6" }).click();

  await expect(
    page.getByRole("heading", { name: "The moat is defended!" }),
  ).toBeVisible({ timeout: 45_000 });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Continue to campaign" }).click();

  const mimicMarket = page.getByRole("button", {
    name: /Mimic Market/,
  });
  await expect(mimicMarket).toHaveAccessibleName(/Mimic Market\. Unlocked\./);
  await expect(mimicMarket).toContainText("Unlocked · preview coming later");
  await expect(page.getByText("1 victory")).toBeVisible();
  await expect(page.locator(".sync-pill")).toContainText("synced");

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(mimicMarket).toContainText("Unlocked · preview coming later");
  await expect(page.getByText("1 victory")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(mimicMarket).toContainText("Unlocked · preview coming later");
  await expect(page.getByText("1 victory")).toBeVisible();
  await context.setOffline(false);
});

test("cancels and confirms mission abandonment without retaining progress", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  await page.getByRole("button", { name: /Fork Knight/ }).click();
  await page.getByRole("button", { name: "Leave mission" }).click();
  const dialog = page.getByRole("dialog", { name: "Leave this mission?" });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByText(/current mission progress will be lost/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue mission" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Fork Knight/ }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(page.getByText("Wave in progress")).toBeVisible();
  await page.getByRole("button", { name: "Leave mission" }).click();
  await page.getByRole("button", { name: "Abandon mission" }).click();

  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText(/victor(y|ies)/i)).not.toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText(/victor(y|ies)/i)).not.toBeVisible();
});
