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
      onSignOut={vi.fn().mockResolvedValue(undefined)}
    />,
  );
  return onStart;
}

describe("campaign screen", () => {
  it("shows the background-play setting with its mobile limitation", () => {
    renderCampaign();

    fireEvent.click(screen.getByText("Traveling settings cart"));
    expect(
      screen.getByRole("checkbox", { name: /Keep playing while away/i }),
    ).not.toBeChecked();
    expect(
      screen.getByText(/mobile browsers and operating systems may throttle/i),
    ).toBeVisible();
    expect(
      screen.getByText(/uninterrupted play cannot be guaranteed/i),
    ).toBeVisible();
  });

  it("shows exactly ten playable mission nodes across all three acts", () => {
    renderCampaign();

    expect(
      screen.getAllByRole("button", {
        name: /The Muddy Moat|Mimic Market|Troll Tollway|Castle Hassle|Frozen Assets|Department of Unnecessary Bridges|Siege and Desist|Lava Lamp District|Necromancers' Networking Event|Quarterly Dragon Review/,
      }),
    ).toHaveLength(10);
    expect(screen.getByText("0/10")).toBeInTheDocument();
    expect(screen.queryByText(/preview coming later/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Goblin filler, sprinting mimics, armored tax trolls/),
    ).toBeInTheDocument();
  });

  it("marks the three Act III missions as sequentially locked", () => {
    renderCampaign();

    const lockedButtons = screen.getAllByRole("button", {
      name: /Lava Lamp District.*Locked|Necromancers' Networking Event.*Locked|Quarterly Dragon Review.*Locked/,
    });
    expect(lockedButtons).toHaveLength(3);
    for (const button of lockedButtons) {
      expect(button).toHaveAttribute("aria-disabled", "true");
    }
  });

  it("describes the Act II finale's next playable mission and reward", () => {
    const fresh = createFreshSave();
    renderCampaign({
      ...fresh,
      campaign: {
        ...fresh.campaign,
        unlockedNodeIds: [
          ...fresh.campaign.unlockedNodeIds,
          "siege-and-desist",
        ],
      },
    });

    fireEvent.click(
      screen.getByRole("button", { name: /Siege and Desist.*Unlocked/i }),
    );

    expect(screen.getByText("Lava Lamp District + Power Chord")).toBeVisible();
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

  it("starts each unlocked mission with its authored level id", () => {
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
          "frozen-assets",
          "department-of-unnecessary-bridges",
          "siege-and-desist",
          "lava-lamp-district",
          "necromancers-networking-event",
          "quarterly-dragon-review",
        ],
      },
    };

    for (const [name, levelId] of [
      ["The Muddy Moat", "muddy-moat"],
      ["Mimic Market", "mimic-market"],
      ["Troll Tollway", "troll-tollway"],
      ["Castle Hassle", "castle-hassle"],
      ["Frozen Assets", "frozen-assets"],
      [
        "Department of Unnecessary Bridges",
        "department-of-unnecessary-bridges",
      ],
      ["Siege and Desist", "siege-and-desist"],
      ["Lava Lamp District", "lava-lamp-district"],
      ["Necromancers' Networking Event", "necromancers-networking-event"],
      ["Quarterly Dragon Review", "quarterly-dragon-review"],
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

  it("shows act completion and the persistent campaign epilogue at 10/10", () => {
    const fresh = createFreshSave();
    const levelIds = [
      "muddy-moat",
      "mimic-market",
      "troll-tollway",
      "castle-hassle",
      "frozen-assets",
      "department-of-unnecessary-bridges",
      "siege-and-desist",
      "lava-lamp-district",
      "necromancers-networking-event",
      "quarterly-dragon-review",
    ];
    renderCampaign({
      ...fresh,
      campaign: {
        ...fresh.campaign,
        unlockedNodeIds: levelIds,
        levels: Object.fromEntries(
          levelIds.map((levelId) => [
            levelId,
            {
              bestScore: 1,
              victories: 1,
              completedMasteryIds: [],
              completedModifierIds: [],
            },
          ]),
        ),
      },
    });

    expect(screen.getByText("10/10")).toBeVisible();
    expect(screen.getByText("4/4 complete")).toBeVisible();
    expect(screen.getAllByText("3/3 complete")).toHaveLength(2);
    expect(
      screen.getByText("The Quarterly Review is adjourned."),
    ).toBeVisible();
    expect(
      screen.getAllByText(/Completion Crest.*Executive Palette/),
    ).toHaveLength(2);
  });

  it("shows recovered final victory as persistent campaign completion", () => {
    const fresh = createFreshSave();
    const levelIds = [
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
    renderCampaign({
      ...fresh,
      campaign: {
        ...fresh.campaign,
        unlockedNodeIds: [...levelIds, "quarterly-dragon-review"],
        levels: Object.fromEntries(
          levelIds.map((levelId) => [
            levelId,
            {
              bestScore: 1,
              victories: 1,
              completedMasteryIds: [],
              completedModifierIds: [],
            },
          ]),
        ),
        recentResults: [
          {
            levelId: "quarterly-dragon-review",
            seed: 10,
            contentVersion: 3,
            modifierIds: [],
            result: "victory",
            score: 10_000,
            completedMasteryIds: [],
            completedAt: "2026-09-01T12:00:00.000Z",
          },
        ],
      },
    });

    expect(screen.getByText("10/10")).toBeVisible();
    expect(
      screen.getByText("The Quarterly Review is adjourned."),
    ).toBeVisible();
  });
});
