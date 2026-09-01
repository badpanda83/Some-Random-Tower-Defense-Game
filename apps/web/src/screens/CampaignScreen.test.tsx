import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFreshSave } from "../save.js";
import { CampaignScreen } from "./CampaignScreen.js";

afterEach(cleanup);

function renderCampaign(
  save = createFreshSave(),
  onStart = vi.fn().mockResolvedValue(undefined),
) {
  render(
    <CampaignScreen
      save={save}
      profile={null}
      syncStatus="local"
      installAvailable={false}
      onInstall={vi.fn()}
      onStart={onStart}
      onResume={vi.fn()}
      onSettings={vi.fn()}
      onHome={vi.fn()}
    />,
  );
  return onStart;
}

describe("Act I campaign", () => {
  it("shows exactly four real mission nodes and an honest Act II boundary", () => {
    renderCampaign();

    expect(
      screen.getAllByRole("button", {
        name: /The Muddy Moat|Mimic Market|Troll Tollway|Castle Hassle/,
      }),
    ).toHaveLength(4);
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByText(/Coming in the next campaign layer/)).toBeVisible();
    expect(screen.queryByText(/preview coming later/i)).not.toBeInTheDocument();
  });

  it("explains a locked mission without allowing it to start", () => {
    renderCampaign();

    fireEvent.click(
      screen.getByRole("button", { name: /Mimic Market.*Locked/i }),
    );

    expect(screen.getByRole("heading", { name: "Mimic Market" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Win mission 1 to unlock" }),
    ).toBeDisabled();
  });

  it("requires confirmation before replacing another mission checkpoint", () => {
    const onStart = vi.fn().mockResolvedValue(undefined);
    const fresh = createFreshSave();
    renderCampaign(
      {
        ...fresh,
        campaign: {
          ...fresh.campaign,
          unlockedNodeIds: ["muddy-moat", "mimic-market"],
        },
        checkpoint: {
          levelId: "muddy-moat",
          seed: 7,
          modifierIds: [],
          tick: 100,
          nextWave: 1,
          lives: 12,
          gold: 200,
          score: 100,
          spawnedEnemies: 8,
          placements: [],
          metrics: {
            spentGold: 0,
            leakedEnemies: 0,
            soldTowers: 0,
            usedTowerIds: [],
          },
        },
      },
      onStart,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Mimic Market.*Unlocked/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Begin defense" }));

    expect(screen.getByRole("dialog")).toHaveTextContent(
      /Discard the current checkpoint/,
    );
    expect(
      screen.getByRole("button", { name: "Keep current camp" }),
    ).toHaveFocus();
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Begin defense" }));
    fireEvent.click(screen.getByRole("button", { name: "Discard and begin" }));
    expect(onStart).toHaveBeenCalledWith("mimic-market", [], true);
  });

  it("starts each unlocked Act I mission with its authored level id", () => {
    const fresh = createFreshSave();
    const allUnlocked = {
      ...fresh,
      campaign: {
        ...fresh.campaign,
        unlockedNodeIds: [
          "muddy-moat",
          "mimic-market",
          "troll-tollway",
          "castle-hassle",
        ],
      },
    };

    for (const [name, levelId] of [
      ["The Muddy Moat", "muddy-moat"],
      ["Mimic Market", "mimic-market"],
      ["Troll Tollway", "troll-tollway"],
      ["Castle Hassle", "castle-hassle"],
    ] as const) {
      const onStart = renderCampaign(allUnlocked);
      fireEvent.click(
        screen.getByRole("button", {
          name: new RegExp(`${name}.*Unlocked`, "i"),
        }),
      );
      fireEvent.click(screen.getByRole("button", { name: "Begin defense" }));
      expect(onStart).toHaveBeenCalledWith(levelId, [], false);
      cleanup();
    }
  });
});
