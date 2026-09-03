import { afterEach, describe, expect, it } from "vitest";

import { createFreshSave } from "./save.js";
import {
  activateDevelopmentState,
  assertDevelopmentRuntime,
  clearDevelopmentState,
  grantTestResources,
  loadDevelopmentState,
  restoreDevelopmentSnapshot,
  storeDevelopmentState,
  TEST_RESOURCE_AMOUNT,
} from "./developer-tools.js";

afterEach(() => {
  localStorage.clear();
});

describe("development test resources", () => {
  it("is guarded at runtime outside development", () => {
    expect(() => assertDevelopmentRuntime(false)).toThrow(
      "Development tools are unavailable in this build.",
    );
    expect(() => grantTestResources(createFreshSave(), false)).toThrow(
      "Development tools are unavailable in this build.",
    );
  });

  it("sets resources idempotently without changing progression or RPG state", () => {
    const fresh = createFreshSave();
    const save = {
      ...fresh,
      economy: {
        ...fresh.economy,
        questCrowns: 400,
        craftingDust: 250,
        rewardClaimIds: ["mission:one"],
        recentReceipts: [
          {
            kind: "mission-reward" as const,
            requestId: "reward-one",
            createdAtSequence: 1,
            attemptId: "attempt-one",
            questCrownsGranted: 100,
            craftingDustGranted: 25,
            claimIds: ["claim-one"],
          },
        ],
        pity: {
          sinceS: 1,
          sinceSPlus: 2,
          sinceSPlusPlus: 3,
          sinceSPlusPlusPlus: 4,
        },
      },
      inventory: {
        ownedItemIds: ["excalifork"],
        metadata: {
          excalifork: { favorite: true, locked: true, isNew: false },
        },
      },
      loadouts: {
        ...fresh.loadouts,
        "fork-knight": {
          ...fresh.loadouts["fork-knight"],
          weapon: "excalifork",
        },
      },
      settings: { ...fresh.settings, muted: true },
      campaign: {
        ...fresh.campaign,
        unlockedNodeIds: ["muddy-moat", "mimic-market"],
      },
    };

    const granted = grantTestResources(save);
    const repeated = grantTestResources(granted);

    expect(granted.economy.questCrowns).toBe(TEST_RESOURCE_AMOUNT);
    expect(granted.economy.craftingDust).toBe(TEST_RESOURCE_AMOUNT);
    expect(repeated).toEqual(granted);
    expect(granted.campaign).toEqual(save.campaign);
    expect(granted.inventory).toEqual(save.inventory);
    expect(granted.loadouts).toEqual(save.loadouts);
    expect(granted.economy.recentReceipts).toEqual(save.economy.recentReceipts);
    expect(granted.economy.pity).toEqual(save.economy.pity);
    expect(granted.settings).toEqual(save.settings);
  });

  it("restores the exact pre-test snapshot and clears only the test marker", () => {
    const original = {
      ...createFreshSave(),
      settings: { ...createFreshSave().settings, reducedMotion: true },
    };
    const state = activateDevelopmentState(original, null, true);
    storeDevelopmentState(state);
    const modified = {
      ...grantTestResources(original),
      campaign: {
        ...original.campaign,
        unlockedNodeIds: ["muddy-moat", "mimic-market"],
      },
    };

    expect(modified).not.toEqual(original);
    expect(loadDevelopmentState()).toEqual(state);
    expect(restoreDevelopmentSnapshot(state)).toEqual(original);

    clearDevelopmentState();
    expect(loadDevelopmentState()).toBeNull();
  });
});
