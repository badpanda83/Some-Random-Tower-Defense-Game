import { expect, test, type Page } from "@playwright/test";

async function storedCheckpoint(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{
      data?: { checkpoint?: unknown };
      pending?: boolean;
      cloudRevision?: number;
    } | null>((resolve, reject) => {
      const transaction = database.transaction("saves", "readonly");
      const request = transaction.objectStore("saves").get("campaign");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return {
      checkpoint: record?.data?.checkpoint ?? null,
      pending: record?.pending ?? null,
      cloudRevision: record?.cloudRevision ?? null,
    };
  });
}

function towerPadName(position: {
  readonly x: number;
  readonly y: number;
}): string {
  const name = new Map([
    ["245,250", "puddle perch"],
    ["285,448", "mushroom box"],
    ["472,249", "crooked stool"],
    ["713,270", "turnip stage"],
    ["782,474", "bucket throne"],
    ["858,300", "gate crate"],
  ]).get(`${position.x},${position.y}`);
  if (!name) {
    throw new Error(`Unknown tower pad at ${position.x},${position.y}`);
  }
  return name;
}

async function placeTower(
  page: Page,
  towerName: RegExp,
  position: { readonly x: number; readonly y: number },
): Promise<void> {
  const name = ["Discount Wizard", "Fork Knight", "Bardbarian"].find((value) =>
    towerName.test(value),
  );
  if (!name) {
    throw new Error(`Unknown tower ${towerName.source}`);
  }
  await page
    .getByRole("button", {
      name: `Open hero wheel at ${towerPadName(position)}`,
    })
    .click({ timeout: 10_000 });
  await page
    .getByRole("button", {
      name: new RegExp(`^Preview ${name} for \\d+ gold$`),
    })
    .click();
  await page
    .getByRole("button", {
      name: new RegExp(`^Confirm ${name} placement for \\d+ gold$`),
    })
    .click();
}

async function upgradeTower(
  page: Page,
  position: { readonly x: number; readonly y: number },
): Promise<void> {
  await page
    .getByRole("button", {
      name: new RegExp(`^Inspect .+ at ${towerPadName(position)}$`),
    })
    .click();
  await page.getByRole("button", { name: /^Upgrade .+ for \d+ gold$/ }).click();
  await page
    .getByRole("button", { name: /^Confirm .+ upgrade for \d+ gold$/ })
    .click();
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
}) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const canvas = page.locator(".battlefield canvas");
  const gold = page.locator(".resource-gold strong");
  await expect(canvas).toHaveCount(1);
  await expect(canvas).toBeVisible();
  await expect(gold).toHaveText("270");

  const bramblePad = page.getByRole("button", {
    name: "Open hero wheel at bramble seat",
  });
  const forkKnightOption = page.getByRole("button", {
    name: "Preview Fork Knight for 57 gold",
  });
  await bramblePad.click();
  await expect(forkKnightOption).toBeFocused();
  await forkKnightOption.click();
  await expect(
    page.getByRole("button", { name: "Cancel Fork Knight placement" }),
  ).toBeFocused();
  await expect(page.getByText("Fork Knight · 57g")).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm Fork Knight placement for 57 gold",
    }),
  ).toBeVisible();
  await expect(gold).toHaveText("270");
  await page
    .getByRole("button", { name: "Cancel Fork Knight placement" })
    .click();
  await expect(bramblePad).toBeFocused();
  await expect(page.getByText("Fork Knight · 57g")).not.toBeVisible();
  await expect(gold).toHaveText("270");

  await bramblePad.click();
  await forkKnightOption.click();
  await page
    .getByRole("button", {
      name: "Confirm Fork Knight placement for 57 gold",
    })
    .click();
  await expect(
    page.getByRole("group", { name: "Fork Knight actions" }),
  ).toBeVisible();
  await expect(gold).toHaveText("213");
  const initialSell = page.getByRole("button", {
    name: "Sell Fork Knight for 39 gold",
  });
  await expect(initialSell).toBeEnabled();
  await initialSell.click();
  await expect(gold).toHaveText("213");
  await page
    .getByRole("button", {
      name: "Confirm sale of Fork Knight for 39 gold",
    })
    .click();
  await expect(
    page.getByRole("group", { name: "Fork Knight actions" }),
  ).not.toBeVisible();
  await expect(gold).toHaveText("252");

  await page
    .getByRole("button", { name: "Open hero wheel at bramble seat" })
    .click();
  await page
    .getByRole("button", { name: "Preview Fork Knight for 57 gold" })
    .click();
  await page
    .getByRole("button", {
      name: "Confirm Fork Knight placement for 57 gold",
    })
    .click();
  await expect(gold).toHaveText("195");
  await page
    .getByRole("button", { name: "Sell Fork Knight for 39 gold" })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Confirm sale of Fork Knight for 39 gold",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(
    page.getByRole("button", { name: "Dismiss message" }),
  ).toContainText("Wave 1 underway");
  await expect(
    page.getByRole("button", { name: "Pause battle" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Sell Fork Knight for 39 gold" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Pause battle" }).click();
  const battleSettings = page.getByLabel("Battle settings");
  await battleSettings.click();
  await page.getByRole("checkbox", { name: "Low effects" }).check();
  await expect(
    page.getByRole("button", { name: "Resume battle" }),
  ).toBeVisible();
  await battleSettings.click();

  await page
    .getByRole("button", { name: "Open hero wheel at puddle perch" })
    .click();
  await page
    .getByRole("button", { name: "Preview Discount Wizard for 95 gold" })
    .click();
  await expect(page.getByText("Discount Wizard · 95g")).toBeVisible();
  await expect(gold).toHaveText("195");
  await page
    .getByRole("button", {
      name: "Confirm Discount Wizard placement for 95 gold",
    })
    .click();
  await expect(page.getByText(/Discount Wizard · rank 1/)).toBeVisible();
  await expect(gold).toHaveText("100");

  await page
    .getByRole("button", { name: "Upgrade Discount Wizard for 76 gold" })
    .click();
  await expect(gold).toHaveText("100");
  await page
    .getByRole("button", {
      name: "Confirm Discount Wizard upgrade for 76 gold",
    })
    .click();
  await expect(page.getByText(/Discount Wizard · rank 2/)).toBeVisible();
  await expect(gold).toHaveText("24");
  await expect(
    page.getByRole("button", {
      name: "Upgrade Discount Wizard for 119 gold",
    }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: "Open hero wheel at mushroom box" })
    .click();
  await page
    .getByRole("button", { name: "Preview Bardbarian for 85 gold" })
    .click();
  await expect(page.getByText(/need 61g/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm Bardbarian placement for 85 gold",
    }),
  ).toBeDisabled();
  await expect(gold).toHaveText("24");
  await page
    .getByRole("button", { name: "Cancel Bardbarian placement" })
    .click();

  await page
    .getByRole("button", { name: "Inspect Fork Knight at bramble seat" })
    .click();
  await expect(page.getByText(/Fork Knight · rank 1/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Sell Fork Knight for 39 gold" }),
  ).toBeDisabled();
  await expect(gold).toHaveText("24");
});

test("keeps campaign portrait-friendly and explains battle orientation", async ({
  page,
}) => {
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
  const ability = page.getByRole("button", { name: "Arm Forkfall" });
  const leave = page.getByRole("button", { name: "Leave mission" });
  const settings = page.getByLabel("Battle settings");
  const startWave = page.getByRole("button", { name: "Start wave 1" });
  for (const [name, control] of [
    ["battlefield", canvas],
    ["ability", ability],
    ["settings", settings],
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
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.height).toBeGreaterThanOrEqual(240);

  const floatingControls = [
    page.getByRole("group", { name: "Royal Forkfall ability" }),
    page.getByRole("list", { name: "Defender costs" }),
    startWave,
  ];
  const padControls = await page
    .getByRole("group", { name: "Tower pads" })
    .getByRole("button")
    .all();
  for (const floatingControl of floatingControls) {
    const floatingBox = await floatingControl.boundingBox();
    expect(floatingBox).not.toBeNull();
    for (const padControl of padControls) {
      const controlBox = await padControl.boundingBox();
      expect(controlBox).not.toBeNull();
      const overlaps =
        (floatingBox?.x ?? 0) <
          (controlBox?.x ?? 0) + (controlBox?.width ?? 0) &&
        (floatingBox?.x ?? 0) + (floatingBox?.width ?? 0) >
          (controlBox?.x ?? 0) &&
        (floatingBox?.y ?? 0) <
          (controlBox?.y ?? 0) + (controlBox?.height ?? 0) &&
        (floatingBox?.y ?? 0) + (floatingBox?.height ?? 0) >
          (controlBox?.y ?? 0);
      expect(
        overlaps,
        `${await floatingControl.getAttribute("class")} ${JSON.stringify(
          floatingBox,
        )} overlaps ${await padControl.getAttribute("aria-label")} ${JSON.stringify(
          controlBox,
        )}`,
      ).toBe(false);
    }
  }

  const pad = page.getByRole("button", {
    name: "Open hero wheel at bramble seat",
  });
  const padBox = await pad.boundingBox();
  expect(padBox?.width).toBeGreaterThanOrEqual(44);
  expect(padBox?.height).toBeGreaterThanOrEqual(44);
  await pad.click();
  const forkKnight = page.getByRole("button", {
    name: "Preview Fork Knight for 57 gold",
  });
  await expect(forkKnight).toBeVisible();
  const wheelButtonBox = await forkKnight.boundingBox();
  expect(wheelButtonBox?.width).toBeGreaterThanOrEqual(44);
  expect(wheelButtonBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (wheelButtonBox?.x ?? -1) + (wheelButtonBox?.width ?? 569),
  ).toBeLessThanOrEqual(568);
  expect(
    (wheelButtonBox?.y ?? -1) + (wheelButtonBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  await forkKnight.click();
  const confirm = page.getByRole("button", {
    name: "Confirm Fork Knight placement for 57 gold",
  });
  await expect(confirm).toBeVisible();
  const confirmBox = await confirm.boundingBox();
  expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (confirmBox?.y ?? -1) + (confirmBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  await confirm.click();
  const upgrade = page.getByRole("button", {
    name: "Upgrade Fork Knight for 52 gold",
  });
  await expect(upgrade).toBeVisible();
  const upgradeBox = await upgrade.boundingBox();
  expect(upgradeBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (upgradeBox?.y ?? -1) + (upgradeBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  const sell = page.getByRole("button", {
    name: "Sell Fork Knight for 39 gold",
  });
  const sellBox = await sell.boundingBox();
  expect(sellBox?.width).toBeGreaterThanOrEqual(44);
  expect(sellBox?.height).toBeGreaterThanOrEqual(44);
  expect((sellBox?.x ?? -1) + (sellBox?.width ?? 569)).toBeLessThanOrEqual(568);
  expect((sellBox?.y ?? -1) + (sellBox?.height ?? 321)).toBeLessThanOrEqual(
    320,
  );
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

  await placeTower(page, /Discount Wizard/, { x: 245, y: 250 });
  await placeTower(page, /Fork Knight/, { x: 472, y: 249 });
  await placeTower(page, /Fork Knight/, { x: 713, y: 270 });
  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(page.getByRole("button", { name: "Start wave 2" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, { x: 245, y: 250 });
  await page.getByRole("button", { name: "Start wave 2" }).click();
  await expect(page.getByRole("button", { name: "Start wave 3" })).toBeVisible({
    timeout: 30_000,
  });

  await placeTower(page, /Discount Wizard/, { x: 858, y: 300 });
  await page.getByRole("button", { name: "Start wave 3" }).click();
  await expect(page.getByRole("button", { name: "Start wave 4" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, { x: 245, y: 250 });
  await upgradeTower(page, { x: 858, y: 300 });
  await page.getByRole("button", { name: "Start wave 4" }).click();
  await expect(page.getByRole("button", { name: "Start wave 5" })).toBeVisible({
    timeout: 30_000,
  });

  await placeTower(page, /Bardbarian/, { x: 782, y: 474 });
  await upgradeTower(page, { x: 472, y: 249 });
  await page.getByRole("button", { name: "Start wave 5" }).click();
  await expect(page.getByRole("button", { name: "Start wave 6" })).toBeVisible({
    timeout: 30_000,
  });

  await upgradeTower(page, { x: 858, y: 300 });
  await placeTower(page, /Discount Wizard/, { x: 285, y: 448 });
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
  context,
}) => {
  test.setTimeout(45_000);
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Begin defense" }).click();

  await page
    .getByRole("button", { name: "Open hero wheel at bramble seat" })
    .click();
  const forkKnightOption = page.getByRole("button", {
    name: "Preview Fork Knight for 57 gold",
  });
  await expect(forkKnightOption).toBeVisible();
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
  await expect(forkKnightOption).toBeVisible();

  await page.getByRole("button", { name: "Start wave 1" }).click();
  await expect(
    page.getByRole("button", { name: "Dismiss message" }),
  ).toContainText("Wave 1 underway");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Leave mission" }).click();
  await page.getByRole("button", { name: "Abandon mission" }).click();

  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText(/victor(y|ies)/i)).not.toBeVisible();
  await expect
    .poll(async () => (await storedCheckpoint(page)).checkpoint)
    .toBeNull();

  await page.reload();
  expect(await storedCheckpoint(page)).toMatchObject({ checkpoint: null });
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText(/victor(y|ies)/i)).not.toBeVisible();
  await context.setOffline(false);
});
