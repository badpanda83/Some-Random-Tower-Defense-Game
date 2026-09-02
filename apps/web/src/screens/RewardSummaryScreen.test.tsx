import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFreshSave } from "../save.js";
import { RewardSummaryScreen } from "./RewardSummaryScreen.js";

afterEach(cleanup);

describe("reward summary", () => {
  it("shows exact reward lines, balances, chest progress, and first chest CTA", () => {
    const fresh = createFreshSave();
    render(
      <RewardSummaryScreen
        save={{
          ...fresh,
          economy: {
            ...fresh.economy,
            questCrowns: 170,
            craftingDust: 25,
          },
        }}
        result={{
          levelId: "mimic-market",
          seed: 7,
          contentVersion: 4,
          modifierIds: [],
          result: "victory",
          score: 100,
          completedMasteryIds: [],
          completedAt: "2026-09-02T12:00:00.000Z",
          attemptId: "reward-test",
          defeatedBossEnemyIds: ["grand-till-mimic"],
        }}
        lines={[
          {
            kind: "first-clear",
            label: "First clear",
            questCrowns: 90,
            craftingDust: 0,
          },
          {
            kind: "boss-bounty",
            label: "Boss Bounty secured",
            questCrowns: 30,
            craftingDust: 25,
          },
        ]}
        syncStatus="offline"
        onHome={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByText("+120 Crowns")).toBeVisible();
    expect(screen.getByText("170 Crowns")).toBeVisible();
    expect(screen.getByText("+25 Dust")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open your first chest" }),
    ).toBeVisible();
  });
});
