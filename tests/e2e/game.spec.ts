import { expect, test, type Page, type Route } from "@playwright/test";

const MVP_ITEM_IDS = [
  "butter-knife-of-bravery",
  "emergency-pea",
  "fork-of-many-tines",
  "excalifork",
  "apprentice-bathrobe",
  "wand-of-mild-inconvenience",
  "wand-of-definitely-winter",
  "wand-of-ooze-and-aahs",
  "lute-with-one-good-string",
  "metronome-of-questionable-tempo",
  "backup-dancer-in-a-jar",
  "the-forbidden-power-chord",
  "cardboard-cuirass-deluxe-ish",
  "map-that-says-here-ish",
  "boots-of-sensible-standing",
  "pocket-hourglass-mostly-sand",
  "cape-of-the-second-chance",
  "royal-participation-trophy",
  "plot-armor-pin",
] as const;

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

async function storedKeepPlayingWhileAway(page: Page): Promise<boolean | null> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{
      data?: { settings?: { keepPlayingWhileAway?: boolean } };
    } | null>((resolve, reject) => {
      const transaction = database.transaction("saves", "readonly");
      const request = transaction.objectStore("saves").get("campaign");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return record?.data?.settings?.keepPlayingWhileAway ?? null;
  });
}

async function completeRpgTour(page: Page): Promise<void> {
  const tour = page.getByRole("dialog").filter({ hasText: "RPG tour" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Next" }).click();
  await tour.getByRole("button", { name: "Tour complete" }).click();
}

async function prepareFirstChestSave(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("saves", "readwrite");
    const store = transaction.objectStore("saves");
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = store.get("campaign");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const data = record.data as {
      campaign: {
        unlockedNodeIds: string[];
        levels: Record<string, unknown>;
      };
      economy: { questCrowns: number };
      settings: { reducedMotion: boolean };
      guidance: Record<string, boolean>;
    };
    data.campaign.unlockedNodeIds = ["muddy-moat", "mimic-market"];
    data.campaign.levels["muddy-moat"] = {
      bestScore: 100,
      victories: 1,
      completedMasteryIds: [],
      completedModifierIds: [],
    };
    data.economy.questCrowns = 120;
    data.settings.reducedMotion = true;
    data.guidance.battleTutorialComplete = true;
    data.guidance.rpgTourComplete = true;
    store.put({ ...record, data, pending: true }, "campaign");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

async function prepareEconomyManagementSave(page: Page): Promise<void> {
  await page.evaluate(async (itemIds) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("saves", "readwrite");
    const store = transaction.objectStore("saves");
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = store.get("campaign");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const data = record.data as {
      economy: {
        questCrowns: number;
        craftingDust: number;
        lootSeed: string | null;
        pity: Record<string, number>;
      };
      settings: { reducedMotion: boolean };
      guidance: Record<string, boolean>;
      inventory: {
        ownedItemIds: string[];
        metadata: Record<
          string,
          { favorite: boolean; locked: boolean; isNew: boolean }
        >;
      };
      loadouts: Record<string, Record<string, string | null>>;
    };
    data.economy.questCrowns = 120;
    data.economy.craftingDust = 10_000;
    data.economy.lootSeed = "0123456789abcdef0123456789abcdef";
    data.economy.pity = {
      sinceS: 4,
      sinceSPlus: 11,
      sinceSPlusPlus: 29,
      sinceSPlusPlusPlus: 59,
    };
    data.settings.reducedMotion = true;
    data.guidance.firstChestOpened = true;
    data.guidance.rpgTourComplete = true;
    data.guidance.rpgTourPending = false;
    data.guidance.battleTutorialComplete = true;
    data.inventory.ownedItemIds = [...itemIds];
    data.inventory.metadata = Object.fromEntries(
      itemIds.map((itemId) => [
        itemId,
        { favorite: false, locked: false, isNew: false },
      ]),
    );
    data.loadouts["fork-knight"]!.charm = "map-that-says-here-ish";
    store.put({ ...record, data, pending: true }, "campaign");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, MVP_ITEM_IDS);
}

async function storedRpgState(page: Page) {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("saves", "readonly");
    const record = await new Promise<{
      data: {
        economy: {
          questCrowns: number;
          openSequence: number;
          recentReceipts: { kind: string }[];
        };
        inventory: { ownedItemIds: string[] };
        loadouts: Record<string, Record<string, string | null>>;
        guidance: { firstEquipComplete: boolean };
      };
    }>((resolve, reject) => {
      const request = transaction.objectStore("saves").get("campaign");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return {
      crowns: record.data.economy.questCrowns,
      openSequence: record.data.economy.openSequence,
      receiptKinds: record.data.economy.recentReceipts.map(
        (receipt) => receipt.kind,
      ),
      owned: record.data.inventory.ownedItemIds,
      equipped: Object.values(record.data.loadouts).flatMap((loadout) =>
        Object.values(loadout).filter(Boolean),
      ),
      firstEquipComplete: record.data.guidance.firstEquipComplete,
    };
  });
}

function towerPadName(position: {
  readonly x: number;
  readonly y: number;
}): string {
  const name = new Map([
    ["83,74", "bramble seat"],
    ["245,250", "puddle perch"],
    ["285,448", "mushroom box"],
    ["472,249", "crooked stool"],
    ["520,55", "soggy plinth"],
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
      name: new RegExp(`^Preview .+${name}.+\\d+ gold`),
    })
    .click();
  await page
    .getByRole("button", {
      name: new RegExp(`^Confirm .+${name} placement for \\d+ gold$`),
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
  await page
    .getByRole("button", { name: /^Upgrade .+ for \d+ gold\./ })
    .click();
  await page
    .getByRole("button", { name: /^Confirm .+ upgrade for \d+ gold\./ })
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
  await expect(
    page.getByRole("heading", { name: "Save this guest progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Continue on another device" }),
  ).toBeVisible();
  await expect(
    page.getByText(/neither is silently overwritten/i),
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
      name: /Ten authored calamities.*affordable defense force/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();
  await page.getByText("Traveling settings cart").click();
  await expect(page.getByText("Developer tools")).toHaveCount(0);
  await expect(page.getByText("Grant test resources")).toHaveCount(0);

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
    name: /Preview .*Fork Knight.*57 gold/,
  });
  await bramblePad.click();
  await expect(forkKnightOption).toBeFocused();
  await forkKnightOption.click();
  await expect(
    page.getByRole("button", { name: /Cancel .*Fork Knight placement/ }),
  ).toBeFocused();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Fork Knight.*57g/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Confirm .*Fork Knight placement for 57 gold/,
    }),
  ).toBeVisible();
  await expect(gold).toHaveText("270");
  await page
    .getByRole("button", { name: /Cancel .*Fork Knight placement/ })
    .click();
  await expect(bramblePad).toBeFocused();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Fork Knight.*57g/,
    }),
  ).not.toBeVisible();
  await expect(gold).toHaveText("270");

  await bramblePad.click();
  await forkKnightOption.click();
  await page
    .getByRole("button", {
      name: /Confirm .*Fork Knight placement for 57 gold/,
    })
    .click();
  await expect(
    page.getByRole("group", { name: "Fork Knight actions" }),
  ).toBeVisible();
  await expect(gold).toHaveText("213");
  const initialSell = page.getByRole("button", {
    name: /Sell .*Fork Knight for 39 gold/,
  });
  await expect(initialSell).toBeEnabled();
  await initialSell.click();
  await expect(gold).toHaveText("213");
  await page
    .getByRole("button", {
      name: /Confirm sale of .*Fork Knight for 39 gold/,
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
    .getByRole("button", { name: /Preview .*Fork Knight.*57 gold/ })
    .click();
  await page
    .getByRole("button", {
      name: /Confirm .*Fork Knight placement for 57 gold/,
    })
    .click();
  await expect(gold).toHaveText("195");
  await page
    .getByRole("button", { name: /Sell .*Fork Knight for 39 gold/ })
    .click();
  await expect(
    page.getByRole("button", {
      name: /Confirm sale of .*Fork Knight for 39 gold/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start Wave 1" }).click();
  await expect(
    page.getByRole("button", { name: "Dismiss message" }),
  ).toContainText("Wave 1 underway");
  await expect(
    page.getByRole("button", { name: "Pause battle" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: /Sell .*Fork Knight for 39 gold/ }),
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
    .getByRole("button", { name: /Preview .*Discount Wizard.*95 gold/ })
    .click();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Discount Wizard.*95g/,
    }),
  ).toBeVisible();
  await expect(gold).toHaveText("195");
  await page
    .getByRole("button", {
      name: /Confirm .*Discount Wizard placement for 95 gold/,
    })
    .click();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Discount Wizard.*rank 1/,
    }),
  ).toBeVisible();
  await expect(gold).toHaveText("100");

  await page
    .getByRole("button", { name: /Upgrade .*Discount Wizard for 76 gold/ })
    .click();
  await expect(gold).toHaveText("100");
  await page
    .getByRole("button", {
      name: /Confirm .*Discount Wizard upgrade for 76 gold/,
    })
    .click();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Discount Wizard.*rank 2/,
    }),
  ).toBeVisible();
  await expect(gold).toHaveText("24");
  await expect(
    page.getByRole("button", {
      name: /Upgrade .*Discount Wizard for 119 gold/,
    }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: "Open hero wheel at mushroom box" })
    .click();
  await page
    .getByRole("button", { name: /Preview .*Bardbarian.*85 gold/ })
    .click();
  await expect(page.getByText(/need 61g/)).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Confirm .*Bardbarian placement for 85 gold/,
    }),
  ).toBeDisabled();
  await expect(gold).toHaveText("24");
  await page
    .getByRole("button", { name: /Cancel .*Bardbarian placement/ })
    .click();

  await page
    .getByRole("button", { name: /Inspect .*Fork Knight at bramble seat/ })
    .click();
  await expect(
    page.locator(".battlefield-context-label", {
      hasText: /Fork Knight.*rank 1/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Sell .*Fork Knight for 39 gold/ }),
  ).toBeDisabled();
  await expect(gold).toHaveText("24");
});

test("keeps campaign portrait-friendly and explains battle orientation", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(page.getByText("The Muddy Moat").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Begin defense" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Begin defense" }).click();

  const orientation = page.getByText(
    "Turn your phone sideways to defend the realm",
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
  const startWave = page.getByRole("button", { name: "Start Wave 1" });
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
  expect(waveBox?.width).toBeGreaterThanOrEqual(160);
  expect(waveBox?.height).toBeGreaterThanOrEqual(52);
  await expect(startWave).toContainText("Next: Orientation Day");
  const wavePresentation = await startWave.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      color: style.color,
      backgroundColor: style.backgroundColor,
      animationName: style.animationName,
    };
  });
  expect(wavePresentation.color).toBe("rgb(32, 21, 38)");
  expect(wavePresentation.backgroundColor).toBe("rgb(246, 204, 99)");
  expect(wavePresentation.animationName).toBe("wave-ready-pulse");

  const dockBox = await page.locator(".defender-dock").boundingBox();
  const abilityBox = await ability.boundingBox();
  const overlapsWave = (
    box: { x: number; y: number; width: number; height: number } | null,
  ) =>
    box !== null &&
    waveBox !== null &&
    box.x < waveBox.x + waveBox.width &&
    box.x + box.width > waveBox.x &&
    box.y < waveBox.y + waveBox.height &&
    box.y + box.height > waveBox.y;
  expect(overlapsWave(dockBox)).toBe(false);
  expect(overlapsWave(abilityBox)).toBe(false);
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox?.width).toBeGreaterThanOrEqual(568 * 0.95);
  expect(canvasBox?.height).toBeGreaterThanOrEqual(320 * 0.78);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(startWave).toHaveCSS("animation-name", "none");

  const defenderInfo = page.getByRole("button", {
    name: /Sir Stabs-a-Lot.*Fork Knight.*physical single-target damage.*57 gold/i,
  });
  await expect(defenderInfo).toBeVisible();
  if (testInfo.project.name !== "mobile-chromium") {
    await defenderInfo.hover();
    await expect(page.getByRole("tooltip")).toContainText(
      /Sir Stabs-a-Lot.*Fork Knight/i,
    );
  }
  await defenderInfo.focus();
  await expect(page.getByRole("tooltip")).toContainText(
    /physical single-target damage.*range.*cadence/i,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).not.toBeVisible();
  if (testInfo.project.name === "mobile-chromium") {
    await defenderInfo.tap();
  } else {
    await defenderInfo.click();
  }
  await expect(page.getByRole("tooltip")).toContainText(
    /Sir Stabs-a-Lot.*Fork Knight/i,
  );
  await expect(page.locator(".resource-gold strong")).toHaveText("270");
  await page.getByRole("button", { name: "Dismiss defender details" }).click();

  const floatingControls = [
    page.getByRole("group", { name: "Royal Forkfall ability" }),
    page.getByRole("group", { name: "Defender costs" }),
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
  const scaledPad = {
    x: (canvasBox?.x ?? 0) + ((canvasBox?.width ?? 960) * 83) / 960,
    y: (canvasBox?.y ?? 0) + ((canvasBox?.height ?? 540) * 74) / 540,
  };
  if (testInfo.project.name === "mobile-chromium") {
    await page.touchscreen.tap(scaledPad.x, scaledPad.y);
  } else {
    await page.mouse.click(scaledPad.x, scaledPad.y);
  }
  const forkKnight = page.getByRole("button", {
    name: /Preview .*Fork Knight.*57 gold/,
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
    name: /Confirm .*Fork Knight placement for 57 gold/,
  });
  await expect(confirm).toBeVisible();
  const confirmBox = await confirm.boundingBox();
  expect(confirmBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (confirmBox?.y ?? -1) + (confirmBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  await confirm.click();
  const upgrade = page.getByRole("button", {
    name: /Upgrade .*Fork Knight for 52 gold/,
  });
  await expect(upgrade).toBeVisible();
  const upgradeBox = await upgrade.boundingBox();
  expect(upgradeBox?.height).toBeGreaterThanOrEqual(44);
  expect(
    (upgradeBox?.y ?? -1) + (upgradeBox?.height ?? 321),
  ).toBeLessThanOrEqual(320);
  const sell = page.getByRole("button", {
    name: /Sell .*Fork Knight for 39 gold/,
  });
  const sellBox = await sell.boundingBox();
  expect(sellBox?.width).toBeGreaterThanOrEqual(44);
  expect(sellBox?.height).toBeGreaterThanOrEqual(44);
  expect((sellBox?.x ?? -1) + (sellBox?.width ?? 569)).toBeLessThanOrEqual(568);
  expect((sellBox?.y ?? -1) + (sellBox?.height ?? 321)).toBeLessThanOrEqual(
    320,
  );

  await page.setViewportSize({ width: 852, height: 393 });
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(393 * 0.82);
  const wideCanvasBox = await canvas.boundingBox();
  expect(wideCanvasBox?.width).toBeGreaterThanOrEqual(852 * 0.95);
  expect(
    (wideCanvasBox?.x ?? -1) + (wideCanvasBox?.width ?? 853),
  ).toBeLessThanOrEqual(852);
  expect(
    (wideCanvasBox?.y ?? -1) + (wideCanvasBox?.height ?? 394),
  ).toBeLessThanOrEqual(393);

  if (testInfo.project.name !== "mobile-chromium") {
    await page.setViewportSize({ width: 1600, height: 900 });
    const largeCanvasBox = await canvas.boundingBox();
    expect(largeCanvasBox?.width).toBeLessThanOrEqual(1440);
    expect(largeCanvasBox?.x).toBeGreaterThan(0);
    const placedPad = page.getByRole("button", {
      name: /Inspect .*Fork Knight at bramble seat/,
    });
    const expectedPadX =
      (largeCanvasBox?.x ?? 0) + ((largeCanvasBox?.width ?? 960) * 83) / 960;
    await expect
      .poll(async () => {
        const placedPadBox = await placedPad.boundingBox();
        return (placedPadBox?.x ?? 0) + (placedPadBox?.width ?? 0) / 2;
      })
      .toBeCloseTo(expectedPadX, 0);
  }
});

test("persists a completed victory and unlocks Mimic Market offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(420_000);
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

  await placeTower(page, /Fork Knight/, { x: 83, y: 74 });
  await placeTower(page, /Discount Wizard/, { x: 245, y: 250 });
  await placeTower(page, /Fork Knight/, { x: 285, y: 448 });
  await placeTower(page, /Fork Knight/, { x: 520, y: 55 });
  await page.getByRole("button", { name: "Start Wave 1" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 2" })).toBeVisible({
    timeout: 70_000,
  });

  await placeTower(page, /Discount Wizard/, { x: 472, y: 249 });
  await page.getByRole("button", { name: "Start Wave 2" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 3" })).toBeVisible({
    timeout: 70_000,
  });

  await placeTower(page, /Discount Wizard/, { x: 713, y: 270 });
  await placeTower(page, /Fork Knight/, { x: 782, y: 474 });
  await page.getByRole("button", { name: "Start Wave 3" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 4" })).toBeVisible({
    timeout: 70_000,
  });

  await placeTower(page, /Discount Wizard/, { x: 858, y: 300 });
  await upgradeTower(page, { x: 83, y: 74 });
  await upgradeTower(page, { x: 285, y: 448 });
  await page.getByRole("button", { name: "Start Wave 4" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 5" })).toBeVisible({
    timeout: 70_000,
  });

  await upgradeTower(page, { x: 83, y: 74 });
  await upgradeTower(page, { x: 245, y: 250 });
  await upgradeTower(page, { x: 520, y: 55 });
  await page.getByRole("button", { name: "Start Wave 5" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 6" })).toBeVisible({
    timeout: 70_000,
  });

  await upgradeTower(page, { x: 245, y: 250 });
  await upgradeTower(page, { x: 285, y: 448 });
  await page.getByRole("button", { name: "Start Wave 6" }).click();

  await expect(
    page.getByRole("heading", { name: "The Muddy Moat is defended!" }),
  ).toBeVisible({ timeout: 70_000 });
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.getByRole("button", { name: "Continue to campaign" }).click();
  await page.getByRole("button", { name: "Campaign" }).click();

  const mimicMarket = page.getByRole("button", {
    name: /Mimic Market/,
  });
  await expect(mimicMarket).toHaveAccessibleName(/Mimic Market\. Unlocked\./);
  await expect(mimicMarket).toContainText("Act I · ready");
  await expect(page.getByText("1 victory")).toBeVisible();
  await expect(page.locator(".sync-pill")).toContainText("synced");

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(mimicMarket).toContainText("Act I · ready");
  await expect(page.getByText("1 victory")).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(mimicMarket).toContainText("Act I · ready");
  await expect(page.getByText("1 victory")).toBeVisible();
  await context.setOffline(false);
});

async function seedSaveData(page: Page, data: unknown): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const database = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open("dubious-realm", 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        const record = await new Promise<unknown>((resolve, reject) => {
          const transaction = database.transaction("saves", "readonly");
          const request = transaction.objectStore("saves").get("campaign");
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        database.close();
        return Boolean(record);
      }),
    )
    .toBe(true);
  await page.evaluate(async (payload) => {
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
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("saves", "readwrite");
      transaction.objectStore("saves").put(
        {
          data: payload,
          cloudOwnerId: null,
          cloudRevision: 0,
          pending: true,
          updatedAt: new Date().toISOString(),
        },
        "campaign",
      );
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, data);
}

test("completes a real Act II mission (Frozen Assets) from a deterministic mid-campaign checkpoint", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Full Act II victory flow runs once on desktop.",
  );
  await page.route("**/api/**", (route) => route.abort());

  // Deterministic setup: seed Act I as already beaten (unlocking Frozen
  // Assets) plus an authored, previously-validated checkpoint sitting at the
  // start of Frozen Assets' final wave. The actual mission completion below
  // is still played for real through the on-canvas UI.
  const actOneVictory = {
    bestScore: 5_000,
    victories: 1,
    completedMasteryIds: [],
    completedModifierIds: [],
  };
  const checkpoint = {
    levelId: "frozen-assets",
    seed: 123,
    modifierIds: [],
    tick: 12_199,
    nextWave: 7,
    lives: 11,
    gold: 31,
    score: 60_770,
    abilityChargeTicks: 240,
    teaBreakUsedThisWave: false,
    spawnedEnemies: 512,
    placements: [
      { id: "tower-1", towerId: "fork-knight", padId: "frost-perch", level: 3 },
      {
        id: "tower-2",
        towerId: "discount-wizard",
        padId: "iceberg-shelf",
        level: 3,
      },
      {
        id: "tower-3",
        towerId: "fork-knight",
        padId: "floe-crossing",
        level: 3,
      },
      {
        id: "tower-4",
        towerId: "discount-wizard",
        padId: "cold-storage-dock",
        level: 3,
      },
      {
        id: "tower-5",
        towerId: "discount-wizard",
        padId: "vault-approach-north",
        level: 3,
      },
      {
        id: "tower-6",
        towerId: "discount-wizard",
        padId: "vault-approach-south",
        level: 2,
      },
      {
        id: "tower-7",
        towerId: "discount-wizard",
        padId: "vault-gate",
        level: 1,
      },
      {
        id: "tower-8",
        towerId: "discount-wizard",
        padId: "counting-house-ledge",
        level: 1,
      },
    ],
    metrics: {
      spentGold: 1_619,
      leakedEnemies: 3,
      leakedByEnemyId: { "basic-goblin": 3 },
      leakedByWaveIndex: { "0": 3 },
      soldTowers: 0,
      usedTowerIds: ["discount-wizard", "fork-knight"],
      maxTowersPlaced: 8,
      bossDefeatPathPercent: null,
      splitSpawns: 0,
      abilityActivations: {},
      lastEnemyClearedTick: {
        "basic-goblin": 12_199,
        "fast-mimic": 11_867,
        "tax-troll": 10_620,
        "queue-jumper": 11_212,
        "coupon-squire": 11_603,
        "warranty-wraith": 10_824,
      },
    },
  };

  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();

  await seedSaveData(page, {
    contentVersion: 2,
    campaign: {
      unlockedNodeIds: ["muddy-moat"],
      levels: {
        "muddy-moat": actOneVictory,
        "mimic-market": actOneVictory,
        "troll-tollway": actOneVictory,
        "castle-hassle": actOneVictory,
      },
      recentResults: [],
      recordedAttemptIds: [],
    },
    settings: {
      muted: false,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 1,
    },
    checkpoint,
  });
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await completeRpgTour(page);

  const resumeButton = page.getByRole("button", { name: "Resume wave 8" });
  await expect(resumeButton).toBeVisible();
  await resumeButton.click();

  const canvas = page.locator(".battlefield canvas");
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Change game speed" }).click();
  await expect(
    page.getByRole("button", { name: "Change game speed" }),
  ).toHaveText("2×");

  await page.getByRole("button", { name: "Start Wave 8" }).click();
  await expect(
    page.getByRole("heading", { name: "Frozen Assets is defended!" }),
  ).toBeVisible({ timeout: 100_000 });
  await page.getByRole("button", { name: "Continue to campaign" }).click();
  await page.getByRole("button", { name: "Campaign" }).click();

  const frozenAssets = page.getByRole("button", { name: /Frozen Assets/ });
  await expect(frozenAssets).toContainText("1 victory");
  const departmentOfBridges = page.getByRole("button", {
    name: /Department of Unnecessary Bridges/,
  });
  await expect(departmentOfBridges).toHaveAccessibleName(
    /Department of Unnecessary Bridges\. Unlocked\./,
  );
  await expect(departmentOfBridges).toContainText("Act II · ready");

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("button", { name: /Frozen Assets/ }),
  ).toContainText("1 victory");
  await expect(departmentOfBridges).toContainText("Act II · ready");
});

test("completes Act III and persists the 10/10 campaign epilogue", async ({
  page,
}, testInfo) => {
  test.setTimeout(210_000);
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The final campaign completion flow runs once on desktop.",
  );
  await page.route("**/api/**", (route) => route.abort());

  const victory = {
    bestScore: 10_000,
    victories: 1,
    completedMasteryIds: [],
    completedModifierIds: [],
  };
  const completedBeforeFinale = [
    "muddy-moat",
    "mimic-market",
    "troll-tollway",
    "castle-hassle",
    "frozen-assets",
    "department-of-unnecessary-bridges",
    "siege-and-desist",
    "lava-lamp-district",
    "necromancers-networking-event",
  ];
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await seedSaveData(page, {
    contentVersion: 3,
    campaign: {
      unlockedNodeIds: [...completedBeforeFinale, "quarterly-dragon-review"],
      levels: Object.fromEntries(
        completedBeforeFinale.map((levelId) => [levelId, victory]),
      ),
      recentResults: [],
      recordedAttemptIds: [],
    },
    settings: {
      muted: true,
      reducedMotion: false,
      lowEffects: false,
      gameSpeed: 1,
    },
    checkpoint: {
      levelId: "quarterly-dragon-review",
      seed: 123,
      modifierIds: [],
      tick: 14_648,
      nextWave: 9,
      lives: 18,
      gold: 375,
      score: 89_585,
      abilityChargeTicks: 22,
      teaBreakUsedThisWave: false,
      spawnedEnemies: 608,
      placements: [
        {
          id: "tower-1",
          towerId: "fork-knight",
          padId: "warehouse-door",
          level: 4,
        },
        {
          id: "tower-2",
          towerId: "discount-wizard",
          padId: "warehouse-rack",
          level: 4,
        },
        {
          id: "tower-3",
          towerId: "fork-knight",
          padId: "courtyard-door",
          level: 4,
        },
        {
          id: "tower-4",
          towerId: "discount-wizard",
          padId: "courtyard-dais",
          level: 4,
        },
        {
          id: "tower-5",
          towerId: "fork-knight",
          padId: "tunnel-desk",
          level: 3,
        },
        {
          id: "tower-6",
          towerId: "discount-wizard",
          padId: "tunnel-lamp",
          level: 2,
        },
        {
          id: "tower-7",
          towerId: "fork-knight",
          padId: "review-left",
          level: 1,
        },
        {
          id: "tower-8",
          towerId: "discount-wizard",
          padId: "review-right",
          level: 1,
        },
        {
          id: "tower-9",
          towerId: "fork-knight",
          padId: "gate-north",
          level: 1,
        },
        {
          id: "tower-10",
          towerId: "discount-wizard",
          padId: "gate-south",
          level: 1,
        },
      ],
      metrics: {
        spentGold: 2_247,
        leakedEnemies: 0,
        leakedByEnemyId: {},
        leakedByWaveIndex: {},
        soldTowers: 0,
        usedTowerIds: ["discount-wizard", "fork-knight"],
        maxTowersPlaced: 10,
        bossDefeatPathPercent: 47,
        splitSpawns: 128,
        abilityActivations: { "royal-forkfall": 60 },
        lastEnemyClearedTick: {
          "basic-goblin": 13_793,
          "fast-mimic": 2_154,
          "queue-jumper": 11_903,
          "coupon-squire": 12_165,
          "warranty-wraith": 11_954,
          "bog-guard": 3_371,
          "tax-troll": 14_648,
          "middle-manager-mage": 13_156,
          "refund-slime": 13_769,
          "dragon-intern": 9_970,
        },
        leaksDuringEnvironmentHazards: 0,
        exposedPadUses: 0,
        referredEnemiesReachedHalfway: 0,
        referredWaveIndices: [],
        bossReinforcementCalls: {},
      },
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await completeRpgTour(page);
  await page.getByRole("button", { name: "Resume wave 10" }).click();
  await expect(page.getByRole("button", { name: "Start Wave 10" })).toBeVisible(
    { timeout: 20_000 },
  );
  await page.getByRole("button", { name: "Change game speed" }).click();
  await page.getByRole("button", { name: "Start Wave 10" }).click();

  await expect(
    page.getByRole("status", {
      name: /Chief Executive Dragon health and ward status/,
    }),
  ).toBeVisible({ timeout: 80_000 });
  await expect(
    page.getByRole("heading", { name: "Quarterly Dragon Review is defended!" }),
  ).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText(/campaign epilogue is unlocked/i)).toBeVisible();
  await page.getByRole("button", { name: "Continue to campaign" }).click();
  await page.getByRole("button", { name: "Campaign" }).click();

  await expect(page.getByText("10/10").first()).toBeVisible();
  await expect(
    page.getByText("The Quarterly Review is adjourned."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Quarterly Dragon Review\. Unlocked\./ }),
  ).toContainText("1 victory");

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(page.getByText("10/10").first()).toBeVisible();
  await expect(
    page.getByText("The Quarterly Review is adjourned."),
  ).toBeVisible();
});

test("opens the guided chest offline, equips it, and returns to Mission 2", async ({
  page,
  context,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await prepareFirstChestSave(page);
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Chests" }).click();

  await expect(page.getByText(/S or better within 5 chests/)).toBeVisible();
  await expect(page.getByText(/C 35% · B 27% · A 19%/)).toBeVisible();
  await context.setOffline(true);
  await page
    .getByRole("article")
    .filter({ hasText: "Royal Supply Chest" })
    .getByRole("button", { name: "Review purchase" })
    .click();
  await page.getByRole("button", { name: "Confirm and open one" }).click();
  await expect(
    page.getByRole("button", { name: "Compare & equip" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Compare & equip" }).click();
  await page.getByRole("button", { name: "Equip" }).click();
  await page.getByRole("button", { name: "Confirm equip" }).click();
  await expect(page.getByText("Gear lesson complete.")).toBeVisible();
  await page.getByRole("button", { name: "Continue to Mission 2" }).click();
  await expect(
    page.getByRole("button", { name: /Mimic Market\. Unlocked\./ }),
  ).toBeVisible();

  await expect
    .poll(() => storedRpgState(page))
    .toMatchObject({
      crowns: 0,
      openSequence: 1,
      receiptKinds: expect.arrayContaining(["chest-opened", "equipped"]),
      owned: expect.arrayContaining([expect.any(String)]),
      equipped: expect.arrayContaining([expect.any(String)]),
      firstEquipComplete: true,
    });
  await context.setOffline(false);
});

test("welcomes a veteran and keeps their checkpoint during replayable training", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The veteran migration and training checkpoint guard run once on desktop.",
  );
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await expect
    .poll(() => storedCheckpoint(page))
    .toMatchObject({
      checkpoint: null,
      pending: true,
    });
  await seedSaveData(page, {
    contentVersion: 3,
    campaign: {
      unlockedNodeIds: ["muddy-moat", "frozen-assets"],
      levels: {
        "muddy-moat": {
          bestScore: 100,
          victories: 1,
          completedMasteryIds: [],
          completedModifierIds: [],
        },
      },
      recentResults: [],
      recordedAttemptIds: [],
    },
    settings: {
      muted: true,
      reducedMotion: true,
      lowEffects: false,
      gameSpeed: 1,
    },
    checkpoint: {
      levelId: "muddy-moat",
      seed: 77,
      modifierIds: [],
      tick: 100,
      nextWave: 1,
      lives: 18,
      gold: 225,
      score: 500,
      spawnedEnemies: 12,
      placements: [],
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    },
  });
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();

  const tour = page.getByRole("dialog").filter({ hasText: "RPG tour" });
  await expect(tour).toContainText(
    "This Veteran Welcome Grant includes 120 bonus Crowns",
  );
  await completeRpgTour(page);
  await expect(tour).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Resume wave 2" }),
  ).toBeVisible();

  await page.getByText("Traveling settings cart").click();
  await page.getByRole("button", { name: "Replay battle help" }).click();
  await expect(page.locator(".battlefield canvas")).toBeVisible();
  await page.getByText("Why?").click();
  await expect(
    page.getByText("Fork is precise, Wizard splashes, and Bard slows groups."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Leave mission" }).click();
  await page.getByRole("button", { name: "Abandon mission" }).click();

  await expect(
    page.getByRole("button", { name: "Resume wave 2" }),
  ).toBeVisible();
  await expect
    .poll(() => storedCheckpoint(page))
    .toMatchObject({
      checkpoint: {
        levelId: "muddy-moat",
        nextWave: 1,
      },
    });
});

test("converts a duplicate, crafts directly, moves universal gear, and locks checkpoints", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The complete inventory transaction path runs once on desktop.",
  );
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await expect
    .poll(() => storedCheckpoint(page))
    .toMatchObject({
      checkpoint: null,
      pending: true,
    });
  await prepareEconomyManagementSave(page);
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Chests" }).click();

  await expect(page.getByText(/S\+\+\+ within 1/)).toBeVisible();
  await page
    .getByRole("article")
    .filter({ hasText: "Royal Supply Chest" })
    .getByRole("button", { name: "Review purchase" })
    .click();
  await page.getByRole("button", { name: "Confirm and open one" }).click();
  await expect(
    page.getByText("Duplicate converted: +460 Dust total"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to chests" }).click();
  await page.getByRole("button", { name: "Defenders" }).click();

  const search = page.getByLabel("Search");
  await search.fill("Butter Knife");
  await page.getByRole("button", { name: /Butter Knife of Bravery/ }).click();
  await page.getByRole("button", { name: "Salvage for 10 Dust" }).click();
  await page.getByRole("button", { name: "Confirm salvage" }).click();
  await page
    .getByRole("button", { name: "Craft exactly this item · 80 Dust" })
    .click();
  await page.getByRole("button", { name: "Confirm craft" }).click();
  await expect(
    page.getByText(/Butter Knife of Bravery crafted directly/),
  ).toBeVisible();

  await search.fill("Map That Says");
  await page
    .locator(".inventory-list")
    .getByRole("button", { name: /Map That Says 'Here-ish'/ })
    .click();
  await page.getByLabel("Equip for").selectOption("bardbarian");
  await page.getByRole("button", { name: "Equip" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Move Map That Says 'Here-ish' from Fork Knight to Bardbarian",
  );
  await page.getByRole("button", { name: "Confirm equip" }).click();
  await expect(
    page.getByText("Map That Says 'Here-ish' equipped for Bardbarian."),
  ).toBeVisible();

  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = database.transaction("saves", "readwrite");
    const store = transaction.objectStore("saves");
    const record = await new Promise<Record<string, unknown>>(
      (resolve, reject) => {
        const request = store.get("campaign");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    const data = record.data as {
      checkpoint: unknown;
      loadouts: Record<string, Record<string, string | null>>;
    };
    data.checkpoint = {
      levelId: "muddy-moat",
      seed: 88,
      modifierIds: [],
      tick: 100,
      nextWave: 1,
      lives: 18,
      gold: 200,
      score: 500,
      spawnedEnemies: 12,
      attemptId: "attempt-loadout-lock",
      loadoutSnapshot: data.loadouts,
      placements: [],
      metrics: {
        spentGold: 0,
        leakedEnemies: 0,
        soldTowers: 0,
        usedTowerIds: [],
      },
    };
    store.put({ ...record, data, pending: true }, "campaign");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Defenders" }).click();
  await page.getByLabel("Search").fill("Butter Knife");
  await page.getByRole("button", { name: /Butter Knife of Bravery/ }).click();
  await expect(page.getByRole("button", { name: "Equip" })).toBeDisabled();
  await expect(
    page.getByText(/Finish or abandon the current mission to change gear/),
  ).toBeVisible();
});

test("blocks economy actions while local and cloud saves conflict", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The cloud conflict surface runs once on desktop.",
  );
  const abortApi = (route: Route) => route.abort();
  await page.route("**/api/**", abortApi);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Enter the realm" }),
  ).toBeVisible();
  await expect
    .poll(() => storedCheckpoint(page))
    .toMatchObject({
      checkpoint: null,
      pending: true,
    });
  await prepareEconomyManagementSave(page);
  const localData = await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dubious-realm", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{ data: Record<string, unknown> }>(
      (resolve, reject) => {
        const transaction = database.transaction("saves", "readonly");
        const request = transaction.objectStore("saves").get("campaign");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      },
    );
    database.close();
    return record.data;
  });
  const remoteData = structuredClone(localData) as {
    settings: { muted: boolean };
  };
  remoteData.settings.muted = !remoteData.settings.muted;

  await page.unroute("**/api/**", abortApi);
  await page.route("**/api/auth/get-session*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: {
          id: "session-1",
          token: "session-token",
          userId: "guest-1",
          expiresAt: "2027-09-02T00:00:00.000Z",
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
        user: {
          id: "guest-1",
          name: "Guest Adventurer",
          email: "guest@example.test",
          emailVerified: false,
          isAnonymous: true,
          createdAt: "2026-09-02T00:00:00.000Z",
          updatedAt: "2026-09-02T00:00:00.000Z",
        },
      }),
    }),
  );
  await page.route("**/api/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "guest-1",
        displayName: "Guest Adventurer",
        isAnonymous: true,
        email: null,
      }),
    }),
  );
  await page.route("**/api/saves/campaign", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        slot: "campaign",
        revision: 2,
        updatedAt: "2026-09-02T00:00:00.000Z",
        data: remoteData,
      }),
    }),
  );
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Which progress should survive?" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nothing has been overwritten.")).toBeVisible();
  await expect(page.locator(".app-surface")).toHaveAttribute("inert", "");
});

test("keeps portrait progression menus inside a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByRole("button", { name: "Defenders" }).click();
  await expect(
    page.getByRole("heading", { name: "Defenders and gear" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Chests" }).click();
  await expect(
    page.getByRole("heading", { name: "One chest. One authored item." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
    name: /Preview .*Fork Knight.*57 gold/,
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

  await page.getByRole("button", { name: "Start Wave 1" }).click();
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
  await expect(page.getByText("0 victories")).toBeVisible();
  await expect
    .poll(async () => (await storedCheckpoint(page)).checkpoint)
    .toBeNull();

  await page.reload();
  expect(await storedCheckpoint(page)).toMatchObject({ checkpoint: null });
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await expect(
    page.getByRole("button", { name: /Resume wave/ }),
  ).not.toBeVisible();
  await expect(page.getByText("0 victories")).toBeVisible();
  await context.setOffline(false);
});

test("persists background play and explains its limits in campaign and battle settings", async ({
  page,
}) => {
  await page.route("**/api/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByText("Traveling settings cart").click();

  const campaignToggle = page.getByRole("checkbox", {
    name: /Keep playing while away/i,
  });
  await expect(campaignToggle).not.toBeChecked();
  await expect(
    page.getByText(/mobile browsers and operating systems may throttle/i),
  ).toBeVisible();
  await expect(
    page.getByText(/uninterrupted play cannot be guaranteed/i),
  ).toBeVisible();
  const campaignLabel = campaignToggle.locator("..");
  expect((await campaignLabel.boundingBox())?.height).toBeGreaterThanOrEqual(
    44,
  );

  await campaignToggle.check();
  await expect.poll(() => storedKeepPlayingWhileAway(page)).toBe(true);

  await page.reload();
  await page.getByRole("button", { name: "Enter the realm" }).click();
  await page.getByText("Traveling settings cart").click();
  await expect(
    page.getByRole("checkbox", { name: /Keep playing while away/i }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Begin defense" }).click();
  await page.getByLabel("Battle settings").click();
  const battleToggle = page.getByRole("checkbox", {
    name: /Keep playing while away/i,
  });
  await expect(battleToggle).toBeChecked();
  await expect(
    page.getByText(/switching tabs or windows will not intentionally pause/i),
  ).toBeVisible();
  const battleLabel = battleToggle.locator("..");
  expect((await battleLabel.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});
