import { describe, expect, it } from "vitest";

import {
  campaignNodes,
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  rewardDefinitions,
  towerDefinitions,
} from "./content.js";

describe("content integrity", () => {
  it("keeps stable definition keys aligned with ids", () => {
    for (const collection of [
      towerDefinitions,
      enemyDefinitions,
      modifierDefinitions,
      levelDefinitions,
    ]) {
      for (const [key, definition] of Object.entries(collection)) {
        expect(definition.id).toBe(key);
      }
    }
  });

  it("references only known content", () => {
    for (const level of Object.values(levelDefinitions)) {
      expect(new Set(level.pads.map((pad) => pad.id)).size).toBe(
        level.pads.length,
      );
      expect(level.path.length).toBeGreaterThan(1);
      for (const wave of level.waves) {
        for (const spawn of wave.spawns) {
          expect(enemyDefinitions).toHaveProperty(spawn.enemyId);
        }
      }
      for (const modifierId of level.availableModifierIds) {
        expect(modifierDefinitions).toHaveProperty(modifierId);
      }
      for (const rewardId of level.rewardIds) {
        expect(rewardDefinitions).toHaveProperty(rewardId);
      }
      for (const pad of level.pads) {
        for (const towerId of pad.allowedTowerIds ?? []) {
          expect(towerDefinitions).toHaveProperty(towerId);
        }
        for (const shutdown of pad.shutdowns ?? []) {
          expect(shutdown.waveIndex).toBeLessThan(level.waves.length);
          expect(shutdown.fromTick).toBeLessThan(shutdown.toTick);
        }
      }
    }

    expect(new Set(campaignNodes.map((node) => node.id)).size).toBe(
      campaignNodes.length,
    );
    for (const node of campaignNodes) {
      if (node.levelId) {
        expect(levelDefinitions).toHaveProperty(node.levelId);
      }
      for (const rewardId of node.rewardIds) {
        expect(rewardDefinitions).toHaveProperty(rewardId);
      }
      for (const condition of node.unlockConditions) {
        if (condition.kind === "victory") {
          expect(levelDefinitions).toHaveProperty(condition.levelId);
        }
        if (condition.kind === "legacy-modifier") {
          expect(modifierDefinitions).toHaveProperty(condition.modifierId);
        }
      }
    }
  });

  it("keeps the intended tower economy and status tuning", () => {
    expect(
      Object.fromEntries(
        Object.values(towerDefinitions).map((tower) => [
          tower.id,
          {
            cost: tower.cost,
            upgrades: tower.levels
              .map((level) => level.upgradeCost)
              .filter((cost) => cost !== null),
          },
        ]),
      ),
    ).toEqual({
      "fork-knight": { cost: 57, upgrades: [52, 85, 140] },
      "discount-wizard": { cost: 95, upgrades: [76, 119, 165] },
      bardbarian: { cost: 85, upgrades: [66, 105, 150] },
    });
    expect(towerDefinitions.bardbarian.slowPercent).toBe(35);
    expect(towerDefinitions.bardbarian.slowTicks).toBe(60);
  });

  it("exposes exactly seven playable levels across Act I and Act II, plus an honest Act III boundary", () => {
    expect(Object.keys(levelDefinitions).sort()).toEqual([
      "castle-hassle",
      "department-of-unnecessary-bridges",
      "frozen-assets",
      "mimic-market",
      "muddy-moat",
      "siege-and-desist",
      "troll-tollway",
    ]);
    expect(campaignNodes).toHaveLength(10);
    const playableNodes = campaignNodes.filter((node) => node.levelId !== null);
    expect(playableNodes).toHaveLength(7);
    for (const node of playableNodes) {
      expect(node.act === 1 || node.act === 2).toBe(true);
    }
    const previewNodes = campaignNodes.filter((node) => node.levelId === null);
    expect(previewNodes).toHaveLength(3);
    for (const node of previewNodes) {
      expect(node.act).toBe(3);
      // An honest "coming later" placeholder never unlocks through normal play.
      expect(node.unlockConditions).toHaveLength(0);
    }
    for (const level of Object.values(levelDefinitions)) {
      expect(level.act === 1 || level.act === 2).toBe(true);
    }
  });

  it("keeps stable ids for the promoted Act I and Act II levels", () => {
    expect(levelDefinitions["mimic-market"]?.id).toBe("mimic-market");
    expect(levelDefinitions["troll-tollway"]?.id).toBe("troll-tollway");
    expect(levelDefinitions["frozen-assets"]?.id).toBe("frozen-assets");
    expect(levelDefinitions["department-of-unnecessary-bridges"]?.id).toBe(
      "department-of-unnecessary-bridges",
    );
    expect(levelDefinitions["siege-and-desist"]?.id).toBe("siege-and-desist");
    expect(campaignNodes.map((node) => node.id).sort()).toEqual([
      "act-three-preview-one",
      "act-three-preview-three",
      "act-three-preview-two",
      "castle-hassle",
      "department-of-unnecessary-bridges",
      "frozen-assets",
      "mimic-market",
      "muddy-moat",
      "siege-and-desist",
      "troll-tollway",
    ]);
  });

  it("authors the expected Act I wave counts", () => {
    expect(levelDefinitions["muddy-moat"]?.waves).toHaveLength(6);
    expect(levelDefinitions["mimic-market"]?.waves).toHaveLength(8);
    expect(levelDefinitions["troll-tollway"]?.waves).toHaveLength(8);
    expect(levelDefinitions["castle-hassle"]?.waves).toHaveLength(9);
  });

  it("authors the expected Act II wave counts", () => {
    expect(levelDefinitions["frozen-assets"]?.waves).toHaveLength(8);
    expect(
      levelDefinitions["department-of-unnecessary-bridges"]?.waves,
    ).toHaveLength(9);
    expect(levelDefinitions["siege-and-desist"]?.waves).toHaveLength(9);
  });

  it("keeps each mission's authored pad topology and restrictions", () => {
    expect(levelDefinitions["mimic-market"].pads).toHaveLength(8);
    expect(
      levelDefinitions["mimic-market"].pads.filter(
        (pad) => pad.allowedTowerIds,
      ),
    ).toHaveLength(2);
    expect(levelDefinitions["troll-tollway"].pads).toHaveLength(7);
    expect(
      levelDefinitions["troll-tollway"].pads.filter(
        (pad) => pad.allowedTowerIds,
      ),
    ).toHaveLength(2);
    expect(levelDefinitions["castle-hassle"].pads).toHaveLength(9);
  });

  it("keeps Act II's multi-route pad topology and thin-ice restrictions", () => {
    const frozen = levelDefinitions["frozen-assets"];
    expect(frozen.pads).toHaveLength(8);
    expect(frozen.pads.filter((pad) => pad.laneId === "shared")).toHaveLength(
      3,
    );
    expect(
      frozen.pads.filter((pad) => pad.deniedTowerIds?.includes("fork-knight")),
    ).toHaveLength(3);

    const bridges = levelDefinitions["department-of-unnecessary-bridges"];
    expect(bridges.pads).toHaveLength(7);
    expect(bridges.pads.filter((pad) => pad.laneId === "shared")).toHaveLength(
      2,
    );

    const siege = levelDefinitions["siege-and-desist"];
    expect(siege.pads).toHaveLength(9);
    expect(
      siege.pads.filter((pad) => pad.clusterId === "keep-cluster"),
    ).toHaveLength(3);
  });

  it("declares exactly two authored routes per Act II mission, both reachable from spawns", () => {
    for (const level of [
      levelDefinitions["frozen-assets"],
      levelDefinitions["department-of-unnecessary-bridges"],
      levelDefinitions["siege-and-desist"],
    ]) {
      expect(level.routes).toHaveLength(2);
      const routeIds = new Set(level.routes!.map((route) => route.id));
      expect(routeIds.size).toBe(2);
      const usedRouteIds = new Set(
        level.waves.flatMap((wave) =>
          wave.spawns.map((spawn) => spawn.routeId ?? level.routes![0]!.id),
        ),
      );
      for (const routeId of usedRouteIds) {
        expect(routeIds.has(routeId)).toBe(true);
      }
      expect(usedRouteIds.size).toBe(2);
    }
  });

  it("declares the new Act II enemy traits and multi-phase boss data", () => {
    expect(enemyDefinitions["warranty-wraith"]?.traits).toEqual([
      { kind: "damage-resistance", damageType: "arcane", percent: 50 },
      { kind: "damage-resistance", damageType: "physical", percent: 150 },
    ]);
    expect(enemyDefinitions["middle-manager-mage"]?.traits).toEqual([
      { kind: "speed-aura", radius: 110, speedPercent: 130 },
    ]);
    expect(enemyDefinitions["refund-slime"]?.traits).toEqual([
      { kind: "split-on-defeat", intoEnemyId: "basic-goblin", count: 2 },
    ]);
    // Split children must never themselves carry split-on-defeat, keeping
    // the total authored split count bounded by construction.
    expect(enemyDefinitions["basic-goblin"]?.traits).toBeUndefined();

    expect(enemyDefinitions["queen-of-pending-litigation"]?.traits).toEqual([
      { kind: "first-hit-ward" },
    ]);
    expect(enemyDefinitions["queen-of-pending-litigation"]?.bossPhases).toEqual(
      [
        {
          healthThresholdPercent: 50,
          speedMultiplierPercent: 100,
          escort: { enemyId: "middle-manager-mage", count: 2 },
        },
        {
          healthThresholdPercent: 20,
          speedMultiplierPercent: 180,
          removesWard: true,
        },
      ],
    );
  });

  it("gates Discount Wizard and Bardbarian rank IV behind their Act II rewards", () => {
    const wizard = towerDefinitions["discount-wizard"];
    expect(wizard.baseMaxLevel).toBe(3);
    expect(wizard.levels).toHaveLength(4);
    expect(wizard.levels[3]?.ignoresArmor).toBe(true);
    expect(wizard.levels[3]?.splashRadiusOverride).toBeGreaterThan(
      wizard.splashRadius,
    );
    expect(rewardDefinitions["wizard-actual-certification"]).toMatchObject({
      kind: "tower-rank",
      towerId: "discount-wizard",
      unlockedLevel: 4,
    });
    expect(levelDefinitions["frozen-assets"]?.rewardIds).toContain(
      "wizard-actual-certification",
    );

    const bardbarian = towerDefinitions["bardbarian"];
    expect(bardbarian.baseMaxLevel).toBe(3);
    expect(bardbarian.levels).toHaveLength(4);
    expect(bardbarian.levels[3]?.supportPulse).toBeDefined();
    expect(rewardDefinitions["bardbarian-power-chord"]).toMatchObject({
      kind: "tower-rank",
      towerId: "bardbarian",
      unlockedLevel: 4,
    });
    expect(levelDefinitions["siege-and-desist"]?.rewardIds).toContain(
      "bardbarian-power-chord",
    );
  });

  it("orders the full ten-node campaign sequentially across three acts", () => {
    const orders = campaignNodes
      .map((node) => node.order)
      .sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const actOne = campaignNodes.filter((node) => node.act === 1);
    const actTwo = campaignNodes.filter((node) => node.act === 2);
    const actThree = campaignNodes.filter((node) => node.act === 3);
    expect(actOne).toHaveLength(4);
    expect(actTwo).toHaveLength(3);
    expect(actThree).toHaveLength(3);
    expect(actThree.every((node) => node.levelId === null)).toBe(true);
  });

  it("ends Mimic Market with an elite warded guard formation", () => {
    const closingWave = levelDefinitions["mimic-market"].waves.at(-1)!;
    expect(
      closingWave.spawns.filter((spawn) => spawn.enemyId === "bog-guard"),
    ).toHaveLength(14);
    expect(enemyDefinitions["bog-guard"].traits).toContainEqual({
      kind: "first-hit-ward",
    });
  });

  it("telegraphs alternating, non-overlapping courtyard pad shutdowns in Castle Hassle", () => {
    const level = levelDefinitions["castle-hassle"];
    const padsWithShutdowns = level.pads.filter(
      (pad) => pad.shutdowns && pad.shutdowns.length > 0,
    );
    // At least one outer pad (near the entrance/exit) and one inner pad
    // (mid-courtyard) each get a shutdown schedule, so the mechanic is real
    // rather than cosmetic.
    expect(padsWithShutdowns.length).toBeGreaterThanOrEqual(2);

    const outerPad = level.pads.find((pad) => pad.id === "gatehouse-perch");
    const innerPad = level.pads.find((pad) => pad.id === "banquet-table");
    expect(outerPad?.shutdowns?.length).toBeGreaterThanOrEqual(2);
    expect(innerPad?.shutdowns?.length).toBeGreaterThanOrEqual(2);

    const outerWaveIndexes = new Set(
      outerPad?.shutdowns?.map((window) => window.waveIndex),
    );
    const innerWaveIndexes = new Set(
      innerPad?.shutdowns?.map((window) => window.waveIndex),
    );
    // Alternating: the two pads never close on the same wave.
    for (const waveIndex of outerWaveIndexes) {
      expect(innerWaveIndexes.has(waveIndex)).toBe(false);
    }
    // Telegraphed more than once so players can learn and plan around it.
    expect(outerWaveIndexes.size).toBeGreaterThanOrEqual(2);
    expect(innerWaveIndexes.size).toBeGreaterThanOrEqual(2);
    // Keeps normal mode accessible: the finale boss wave is never affected.
    const bossWaveIndex = level.waves.length - 1;
    expect(outerWaveIndexes.has(bossWaveIndex)).toBe(false);
    expect(innerWaveIndexes.has(bossWaveIndex)).toBe(false);
  });

  it("declares Act I enemy traits and boss phase data", () => {
    expect(enemyDefinitions["coupon-squire"]?.traits).toEqual([
      { kind: "first-hit-ward" },
    ]);
    expect(enemyDefinitions["queue-jumper"]?.traits).toEqual([
      { kind: "slow-immune" },
    ]);
    expect(enemyDefinitions["dragon-intern"]?.bossPhase).toEqual({
      healthThresholdPercent: 50,
      speedMultiplierPercent: 155,
    });
    expect(enemyDefinitions["baron-von-bog"]?.bossPhase).toMatchObject({
      healthThresholdPercent: 50,
      speedMultiplierPercent: 170,
      escort: { enemyId: "bog-guard", count: 2 },
    });
  });

  it("gates Fork Knight rank IV behind the Table Service reward", () => {
    const forkKnight = towerDefinitions["fork-knight"];
    expect(forkKnight.baseMaxLevel).toBe(3);
    expect(forkKnight.levels).toHaveLength(4);
    expect(forkKnight.levels[3]?.pierceCount).toBe(1);
    expect(rewardDefinitions["fork-table-service"]).toMatchObject({
      kind: "tower-rank",
      towerId: "fork-knight",
      unlockedLevel: 4,
    });
    expect(levelDefinitions["mimic-market"]?.rewardIds).toContain(
      "fork-table-service",
    );
  });

  it("rewards Emergency Tea Break after Castle Hassle", () => {
    expect(rewardDefinitions["emergency-tea-break"]).toMatchObject({
      kind: "ability",
      abilityId: "emergency-tea-break",
    });
    expect(levelDefinitions["castle-hassle"]?.rewardIds).toContain(
      "emergency-tea-break",
    );
  });

  it("preserves troll-tollway's legacy modifier unlock alongside victory progression", () => {
    const node = campaignNodes.find(
      (candidate) => candidate.id === "troll-tollway",
    );
    expect(node?.unlock).toBe("modifier");
    expect(node?.unlockSourceId).toBe("stingy-king");
    expect(node?.unlockConditions).toEqual(
      expect.arrayContaining([
        { kind: "victory", levelId: "mimic-market" },
        { kind: "legacy-modifier", modifierId: "stingy-king" },
      ]),
    );
  });

  it("defines the Act I and Act II challenge modifiers", () => {
    expect(Object.keys(modifierDefinitions).sort()).toEqual([
      "red-tape",
      "roadworks",
      "sale-rush",
      "stingy-king",
      "thin-ice",
    ]);
    expect(modifierDefinitions.roadworks.padShutdownExtraTicks).toBeGreaterThan(
      0,
    );
    expect(
      modifierDefinitions["red-tape"].padShutdownExtraTicks,
    ).toBeGreaterThan(0);
  });

  it("defines three typed mastery rules per level", () => {
    for (const level of Object.values(levelDefinitions)) {
      expect(level.mastery).toHaveLength(3);
      for (const mastery of level.mastery) {
        expect(mastery.rule.kind).toBeTruthy();
      }
    }
  });
});
