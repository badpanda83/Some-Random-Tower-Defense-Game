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
      localRevision?: number;
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
      localRevision: record?.localRevision ?? null,
      pending: record?.pending ?? null,
      cloudRevision: record?.cloudRevision ?? null,
    };
  });
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
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Full victory flow runs once on desktop.",
  );
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("saves")) {
          request.result.createObjectStore("saves");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("saves", "readwrite");
    transaction.objectStore("saves").put(
      {
        data: {
          contentVersion: 1,
          campaign: {
            unlockedNodeIds: ["muddy-moat"],
            levels: {},
            recentResults: [],
          },
          settings: {
            muted: true,
            reducedMotion: true,
            lowEffects: true,
            gameSpeed: 2,
          },
          checkpoint: {
            levelId: "muddy-moat",
            seed: 123,
            modifierIds: [],
            tick: 4_027,
            nextWave: 5,
            lives: 12,
            gold: 0,
            score: 15_000,
            spawnedEnemies: 67,
            abilityChargeTicks: 240,
            placements: [
              "bramble-seat",
              "puddle-perch",
              "mushroom-box",
              "crooked-stool",
              "soggy-plinth",
              "turnip-stage",
              "bucket-throne",
              "gate-crate",
            ].map((padId, index) => ({
              id: `tower-${index + 1}`,
              towerId:
                index % 3 === 0
                  ? "discount-wizard"
                  : index % 3 === 1
                    ? "fork-knight"
                    : "bardbarian",
              padId,
              level: 3,
            })),
            metrics: {
              spentGold: 1_500,
              leakedEnemies: 0,
              soldTowers: 0,
              usedTowerIds: ["bardbarian", "discount-wizard", "fork-knight"],
            },
          },
        },
        cloudOwnerId: null,
        cloudRevision: 0,
        localRevision: 1,
        pending: true,
        updatedAt: new Date().toISOString(),
      },
      "campaign",
    );
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Resume wave 6" }).click();
  await page.getByRole("button", { name: "Start wave 6" }).click();

  await expect(
    page.getByRole("heading", { name: "The moat is defended!" }),
  ).toBeVisible({ timeout: 60_000 });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Continue to campaign" }).click();

  const mimicMarket = page.getByRole("button", {
    name: /Mimic Market/,
  });
  await expect(mimicMarket).toContainText("Route charted");
  await expect(page.getByText("1 victory")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(mimicMarket).toContainText("Route charted");
  await expect(page.getByText("1 victory")).toBeVisible();
  await context.setOffline(false);
});

test("cancels and confirms mission abandonment without retaining progress", async ({
  page,
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

  const conflict = page.getByRole("dialog", {
    name: "Which progress should survive?",
  });
  await page.reload({ waitUntil: "networkidle" });
  expect(await storedCheckpoint(page)).toMatchObject({ checkpoint: null });
  await expect(page.locator(".app-surface")).toHaveAttribute(
    "data-sync-status",
    /^(?:synced|offline|conflict)$/,
    { timeout: 20_000 },
  );
  if (await conflict.isVisible()) {
    await conflict.getByRole("button", { name: "Keep this device" }).click();
    await expect(conflict).not.toBeVisible();
  }
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText(/victor(y|ies)/i)).not.toBeVisible();
});
