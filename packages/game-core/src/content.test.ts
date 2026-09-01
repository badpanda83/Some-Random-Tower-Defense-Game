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
      "discount-wizard": { cost: 95, upgrades: [76, 119] },
      bardbarian: { cost: 85, upgrades: [66, 105] },
    });
    expect(towerDefinitions.bardbarian.slowPercent).toBe(35);
    expect(towerDefinitions.bardbarian.slowTicks).toBe(60);
  });

  it("exposes exactly four Act I playable levels and campaign nodes", () => {
    expect(Object.keys(levelDefinitions).sort()).toEqual([
      "castle-hassle",
      "mimic-market",
      "muddy-moat",
      "troll-tollway",
    ]);
    expect(campaignNodes).toHaveLength(4);
    for (const node of campaignNodes) {
      expect(node.levelId).not.toBeNull();
      expect(node.act).toBe(1);
    }
    for (const level of Object.values(levelDefinitions)) {
      expect(level.act).toBe(1);
    }
  });

  it("keeps stable ids for the promoted Act I levels", () => {
    expect(levelDefinitions["mimic-market"]?.id).toBe("mimic-market");
    expect(levelDefinitions["troll-tollway"]?.id).toBe("troll-tollway");
    expect(campaignNodes.map((node) => node.id).sort()).toEqual([
      "castle-hassle",
      "mimic-market",
      "muddy-moat",
      "troll-tollway",
    ]);
  });

  it("authors the expected Act I wave counts", () => {
    expect(levelDefinitions["muddy-moat"]?.waves).toHaveLength(6);
    expect(levelDefinitions["mimic-market"]?.waves).toHaveLength(8);
    expect(levelDefinitions["troll-tollway"]?.waves).toHaveLength(8);
    expect(levelDefinitions["castle-hassle"]?.waves).toHaveLength(9);
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

  it("defines the new Act I challenge modifiers plus the existing one", () => {
    expect(Object.keys(modifierDefinitions).sort()).toEqual([
      "roadworks",
      "sale-rush",
      "stingy-king",
    ]);
    expect(modifierDefinitions.roadworks.padShutdownExtraTicks).toBeGreaterThan(
      0,
    );
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
