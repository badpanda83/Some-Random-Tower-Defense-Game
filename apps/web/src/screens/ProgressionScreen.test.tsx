import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MVP_EQUIPMENT } from "@srtg/game-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFreshSave } from "../save.js";
import { ProgressionScreen } from "./ProgressionScreen.js";

afterEach(cleanup);

describe("RPG progression screen", () => {
  it("shows the complete chest catalog and badges only owned quantities", () => {
    const fresh = createFreshSave();
    render(
      <ProgressionScreen
        tab="chests"
        save={{
          ...fresh,
          inventory: {
            ownedItemIds: [MVP_EQUIPMENT[0]!.id, MVP_EQUIPMENT[1]!.id],
            metadata: {},
          },
        }}
        syncStatus="local"
        selectedItemId={null}
        onSelectedItem={vi.fn()}
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    const catalog = screen.getByRole("region", {
      name: "Everything the chests can cough up",
    });
    expect(within(catalog).getAllByRole("article")).toHaveLength(
      MVP_EQUIPMENT.length,
    );
    for (const item of MVP_EQUIPMENT) {
      expect(within(catalog).getByText(item.name)).toBeVisible();
    }
    expect(within(catalog).getAllByLabelText("Owned quantity: 1")).toHaveLength(
      2,
    );
    expect(within(catalog).queryByLabelText("Owned quantity: 0")).toBeNull();
  });

  it("publishes exact odds and commits one deliberate first chest transaction", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const fresh = createFreshSave();
    const save = {
      ...fresh,
      settings: { ...fresh.settings, reducedMotion: true },
      economy: { ...fresh.economy, questCrowns: 120 },
    };
    render(
      <ProgressionScreen
        tab="chests"
        save={save}
        syncStatus="offline"
        selectedItemId={null}
        onSelectedItem={vi.fn()}
        onCommit={onCommit}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText(/C 35% · B 27% · A 19% · S 11%/)).toBeVisible();
    expect(
      screen.getAllByText(/base-roll odds before guarantees/i),
    ).not.toHaveLength(0);
    expect(screen.getByText(/S or better within 5 chests/)).toBeVisible();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Review purchase" })[0]!,
    );
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Spend 120 Quest Crowns/,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm and open one" }),
    );

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    const committed = onCommit.mock.calls[0]![0];
    expect(committed.economy.questCrowns).toBe(0);
    expect(committed.economy.openSequence).toBe(1);
    expect(committed.inventory.ownedItemIds).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Compare & equip" }),
    ).toBeVisible();
  });

  it("explains checkpoint loadout locks", () => {
    const fresh = createFreshSave();
    render(
      <ProgressionScreen
        tab="defenders"
        save={{
          ...fresh,
          inventory: {
            ownedItemIds: ["butter-knife-of-bravery"],
            metadata: {
              "butter-knife-of-bravery": {
                favorite: false,
                locked: false,
                isNew: false,
              },
            },
          },
          checkpoint: {
            levelId: "muddy-moat",
            seed: 1,
            modifierIds: [],
            tick: 1,
            nextWave: 1,
            lives: 12,
            gold: 100,
            score: 0,
            spawnedEnemies: 1,
            placements: [],
            metrics: {
              spentGold: 0,
              leakedEnemies: 0,
              soldTowers: 0,
              usedTowerIds: [],
            },
          },
        }}
        syncStatus="local"
        selectedItemId="butter-knife-of-bravery"
        onSelectedItem={vi.fn()}
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Equip" })).toBeDisabled();
    expect(
      screen.getByText(/Finish or abandon the current mission to change gear/),
    ).toBeVisible();
  });

  it("names the defender who loses a moved universal item", () => {
    const fresh = createFreshSave();
    render(
      <ProgressionScreen
        tab="defenders"
        save={{
          ...fresh,
          inventory: {
            ownedItemIds: ["map-that-says-here-ish"],
            metadata: {
              "map-that-says-here-ish": {
                favorite: false,
                locked: false,
                isNew: false,
              },
            },
          },
          loadouts: {
            ...fresh.loadouts,
            "fork-knight": {
              ...fresh.loadouts["fork-knight"],
              charm: "map-that-says-here-ish",
            },
          },
        }}
        syncStatus="local"
        selectedItemId="map-that-says-here-ish"
        onSelectedItem={vi.fn()}
        onCommit={vi.fn().mockResolvedValue(undefined)}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Equip for"), {
      target: { value: "bardbarian" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Equip" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Move Map That Says 'Here-ish' from Fork Knight to Bardbarian/,
    );
  });

  it("unequips an item so it can be salvaged safely", async () => {
    const onCommit = vi.fn().mockResolvedValue(undefined);
    const fresh = createFreshSave();
    render(
      <ProgressionScreen
        tab="defenders"
        save={{
          ...fresh,
          inventory: {
            ownedItemIds: ["butter-knife-of-bravery"],
            metadata: {
              "butter-knife-of-bravery": {
                favorite: false,
                locked: false,
                isNew: false,
              },
            },
          },
          loadouts: {
            ...fresh.loadouts,
            "fork-knight": {
              ...fresh.loadouts["fork-knight"],
              weapon: "butter-knife-of-bravery",
            },
          },
        }}
        syncStatus="local"
        selectedItemId="butter-knife-of-bravery"
        onSelectedItem={vi.fn()}
        onCommit={onCommit}
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Unequip" }));
    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Unequip Butter Knife of Bravery from Fork Knight/,
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirm unequip" }));

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(
      onCommit.mock.calls[0]![0].loadouts["fork-knight"].weapon,
    ).toBeNull();
  });
});
