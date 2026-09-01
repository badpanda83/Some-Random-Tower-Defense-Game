import { describe, expect, it } from "vitest";

import {
  campaignNodes,
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
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
    }

    expect(new Set(campaignNodes.map((node) => node.id)).size).toBe(
      campaignNodes.length,
    );
  });
});
