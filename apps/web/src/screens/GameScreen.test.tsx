import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  BattleCheckpoint,
  BattleResult,
  GameCommand,
  Settings,
} from "@srtg/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const battlefieldTest = vi.hoisted(() => ({
  setPaused: vi.fn<(paused: boolean) => void>(),
  paused: false,
  advance: null as null | ((ticks: number) => void),
}));

vi.mock("../game/audio.js", () => ({
  GameAudio: class {
    close() {}
    play() {}
    setMuted() {}
  },
}));

vi.mock("../game/Battlefield.js", async () => {
  const React = await import("react");
  return {
    Battlefield: React.forwardRef(function MockBattlefield(
      props: {
        simulation: {
          dispatch: (command: GameCommand) => {
            state: unknown;
            events: readonly unknown[];
          };
          step: (ticks: number) => {
            state: unknown;
            events: readonly unknown[];
          };
        };
        paused: boolean;
        onState: (state: unknown, events: readonly unknown[]) => void;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      battlefieldTest.advance = (ticks) => {
        if (battlefieldTest.paused) {
          return;
        }
        const result = props.simulation.step(ticks);
        props.onState(result.state, result.events);
      };
      React.useEffect(() => {
        battlefieldTest.paused = props.paused;
        battlefieldTest.setPaused(props.paused);
      }, [props.paused]);
      React.useImperativeHandle(ref, () => ({
        dispatch(command: GameCommand) {
          const result = props.simulation.dispatch(command);
          props.onState(result.state, result.events);
          return true;
        },
        confirmPlacement() {
          return false;
        },
        setSpeed() {},
      }));
      return <div data-testid="battlefield" />;
    }),
  };
});

import { GameScreen } from "./GameScreen.js";

const settings = {
  muted: true,
  reducedMotion: false,
  lowEffects: false,
  gameSpeed: 1 as const,
  keepPlayingWhileAway: false,
};

const activePage = {
  isAway: () => false,
  subscribe: () => () => undefined,
};

class TestPageActivity {
  private away = false;
  private readonly listeners = new Set<() => void>();

  public isAway() {
    return this.away;
  }

  public subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public setAway(away: boolean) {
    this.away = away;
    this.listeners.forEach((listener) => listener());
  }
}

function renderGame(
  checkpoint: BattleCheckpoint | null = null,
  overrides: Partial<{
    onComplete: (result: BattleResult) => Promise<void>;
    onRetry: () => void;
    onAbandon: () => Promise<void>;
  }> = {},
  unlockedRewardIds: readonly string[] = [],
) {
  const callbacks = {
    onCheckpoint: vi.fn(),
    onComplete: vi.fn().mockResolvedValue(undefined),
    onRetry: vi.fn(),
    onAbandon: vi.fn().mockResolvedValue(undefined),
    onSettings: vi.fn(),
    ...overrides,
  };
  render(
    <GameScreen
      levelId={checkpoint?.levelId ?? "muddy-moat"}
      seed={7}
      modifierIds={[]}
      unlockedRewardIds={unlockedRewardIds}
      checkpoint={checkpoint}
      settings={settings}
      synchronizationBlocked={false}
      pageActivity={activePage}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("mission abandonment", () => {
  beforeEach(() => {
    battlefieldTest.paused = false;
    battlefieldTest.setPaused.mockClear();
  });
  afterEach(cleanup);

  describe("wave launch action", () => {
    it("uses a readable numbered label and threat context, then hides during combat", () => {
      renderGame();

      const launch = screen.getByRole("button", { name: "Start Wave 1" });
      expect(launch).toHaveTextContent("Start Wave 1");
      expect(launch).toHaveTextContent("Next: Orientation Day");
      expect(launch).toHaveTextContent(
        "Three drill companies arrive in sequence",
      );
      expect(launch).toHaveClass("is-pulsing");

      fireEvent.click(launch);
      expect(
        screen.queryByRole("button", { name: "Start Wave 1" }),
      ).not.toBeInTheDocument();
    });

    it("disables the ready pulse for the in-game reduced-motion setting", () => {
      render(
        <GameScreen
          levelId="muddy-moat"
          seed={7}
          modifierIds={[]}
          unlockedRewardIds={[]}
          checkpoint={null}
          settings={{ ...settings, reducedMotion: true }}
          synchronizationBlocked={false}
          pageActivity={activePage}
          onCheckpoint={vi.fn()}
          onComplete={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn()}
          onAbandon={vi.fn().mockResolvedValue(undefined)}
          onSettings={vi.fn()}
        />,
      );

      expect(
        screen.getByRole("button", { name: "Start Wave 1" }),
      ).not.toHaveClass("is-pulsing");
    });
  });

  describe("earned battlefield abilities", () => {
    it("reveals Emergency Tea Break and requires explicit cast confirmation", () => {
      renderGame(null, {}, ["emergency-tea-break"]);
      fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
      act(() => battlefieldTest.advance?.(1));

      fireEvent.change(
        screen.getByRole("combobox", { name: "Choose battlefield ability" }),
        { target: { value: "emergency-tea-break" } },
      );
      fireEvent.click(screen.getByRole("button", { name: "Arm Tea" }));

      expect(screen.getByRole("button", { name: "Cast Tea" })).toBeVisible();
      expect(screen.getByText(/armed.*Press Cast to confirm/i)).toBeVisible();
      fireEvent.click(screen.getByRole("button", { name: "Cast Tea" }));
      expect(screen.getByText(/slowed every non-boss enemy/i)).toBeVisible();
    });

    it("requires abilities to be armed again after an intermission", () => {
      renderGame();
      fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
      act(() => battlefieldTest.advance?.(240));
      fireEvent.click(screen.getByRole("button", { name: "Arm Forkfall" }));
      expect(
        screen.getByRole("button", { name: "Cast Forkfall" }),
      ).toBeVisible();

      act(() => battlefieldTest.advance?.(1_000));

      expect(
        screen.getByRole("button", { name: "Arm Forkfall" }),
      ).toBeDisabled();
    });
  });

  describe("Royal Forkfall controls", () => {
    afterEach(cleanup);

    it("shows deterministic charge and rejects not-ready UI activation", () => {
      renderGame();
      const button = screen.getByRole("button", { name: "Arm Forkfall" });

      expect(button).toBeDisabled();
      expect(screen.getByText("0% charged")).toBeInTheDocument();
      expect(screen.getByLabelText("Royal Forkfall charge")).toHaveValue(0);
    });

    describe("result progression", () => {
      afterEach(cleanup);

      function finalWaveCheckpoint(): BattleCheckpoint {
        const pads = [
          "bramble-seat",
          "puddle-perch",
          "mushroom-box",
          "crooked-stool",
          "soggy-plinth",
          "turnip-stage",
          "bucket-throne",
          "gate-crate",
        ];
        return {
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
          placements: pads.map((padId, index) => ({
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
        };
      }

      function reachVictory(overrides: Parameters<typeof renderGame>[1] = {}) {
        const callbacks = renderGame(finalWaveCheckpoint(), overrides);
        fireEvent.click(screen.getByRole("button", { name: "Start Wave 6" }));
        act(() => battlefieldTest.advance?.(10_000));
        expect(
          screen.getByRole("heading", {
            name: "The Muddy Moat is defended!",
          }),
        ).toBeInTheDocument();
        return callbacks;
      }

      it("does not record progress when Retry is chosen", () => {
        const callbacks = reachVictory();

        fireEvent.click(screen.getByRole("button", { name: "Retry" }));

        expect(callbacks.onRetry).toHaveBeenCalledOnce();
        expect(callbacks.onComplete).not.toHaveBeenCalled();
      });

      it("prevents duplicate submission and surfaces a retryable save failure", async () => {
        let rejectSave: (error: Error) => void = () => undefined;
        const pendingSave = new Promise<void>((_resolve, reject) => {
          rejectSave = reject;
        });
        const onComplete = vi
          .fn<(result: BattleResult) => Promise<void>>()
          .mockReturnValueOnce(pendingSave)
          .mockRejectedValueOnce(new Error("disk full"));
        reachVictory({ onComplete });

        const continueButton = screen.getByRole("button", {
          name: "Continue to campaign",
        });
        fireEvent.click(continueButton);
        fireEvent.click(continueButton);
        expect(onComplete).toHaveBeenCalledOnce();
        expect(
          screen.getByRole("button", { name: "Saving result…" }),
        ).toBeDisabled();

        await act(async () => rejectSave(new Error("disk full")));
        expect(await screen.findByRole("alert")).toHaveTextContent(
          /Could not save your result: disk full/,
        );

        fireEvent.click(
          screen.getByRole("button", { name: "Continue to campaign" }),
        );
        await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(2));
        expect(onComplete.mock.calls[1]?.[0]).toEqual(
          onComplete.mock.calls[0]?.[0],
        );
      });
    });

    it("requires an explicit arm step before casting and resets the meter", () => {
      renderGame({
        levelId: "muddy-moat",
        seed: 31,
        modifierIds: [],
        tick: 800,
        nextWave: 2,
        lives: 12,
        gold: 100,
        score: 0,
        spawnedEnemies: 19,
        abilityChargeTicks: 240,
        placements: [],
        metrics: {
          spentGold: 0,
          leakedEnemies: 0,
          soldTowers: 0,
          usedTowerIds: [],
        },
      });
      fireEvent.click(screen.getByRole("button", { name: "Start Wave 3" }));
      act(() => battlefieldTest.advance?.(1));

      fireEvent.click(screen.getByRole("button", { name: "Arm Forkfall" }));
      expect(
        screen.getByRole("button", { name: "Cast Forkfall" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/Press Cast to confirm/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Cast Forkfall" }));
      expect(screen.getByText(/struck for 70 damage/)).toBeInTheDocument();
      expect(screen.getByText("0% charged")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Arm Forkfall" }),
      ).toBeDisabled();
    });
  });

  afterEach(cleanup);

  it("cancels with Escape and restores a running wave", () => {
    const callbacks = renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));

    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));
    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(true);
    expect(
      screen.getByRole("button", { name: "Continue mission" }),
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(
      screen.getByRole("button", { name: "Abandon mission" }),
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(
      screen.getByRole("button", { name: "Continue mission" }),
    ).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(false);
    expect(
      screen.getByRole("button", { name: "Dismiss message" }),
    ).toHaveTextContent("Wave 1 underway");
    expect(callbacks.onAbandon).not.toHaveBeenCalled();
  });

  it("does not unpause a wave that was already paused", () => {
    renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause battle" }));
    battlefieldTest.setPaused.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue mission" }));

    expect(battlefieldTest.paused).toBe(true);
    expect(battlefieldTest.setPaused).not.toHaveBeenCalledWith(false);
    expect(
      screen.getByRole("button", { name: "Resume battle" }),
    ).toBeInTheDocument();
  });

  it("stays paused if synchronization unblocks while confirmation is open", () => {
    const callbacks = {
      onCheckpoint: vi.fn(),
      onComplete: vi.fn(),
      onRetry: vi.fn(),
      onAbandon: vi.fn(),
      onSettings: vi.fn(),
    };
    const game = (synchronizationBlocked: boolean) => (
      <GameScreen
        levelId="muddy-moat"
        seed={7}
        modifierIds={[]}
        unlockedRewardIds={[]}
        checkpoint={null}
        settings={settings}
        synchronizationBlocked={synchronizationBlocked}
        pageActivity={activePage}
        {...callbacks}
      />
    );
    const view = render(game(false));
    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));

    view.rerender(game(true));
    view.rerender(game(false));

    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Continue mission" }));
    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(false);
  });

  it("confirms abandonment during an active wave without recording a result", () => {
    const callbacks = renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon mission" }));

    expect(callbacks.onAbandon).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.onCheckpoint).not.toHaveBeenCalled();
  });

  it("keeps manual and settings-overlay pauses independent", () => {
    renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));
    const menu = screen.getByLabelText("Battle settings");
    const details = menu.closest("details");
    expect(details).not.toBeNull();

    details!.open = true;
    fireEvent(details!, new Event("toggle"));
    expect(battlefieldTest.paused).toBe(true);
    details!.open = false;
    fireEvent(details!, new Event("toggle"));
    expect(battlefieldTest.paused).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Pause battle" }));
    details!.open = true;
    fireEvent(details!, new Event("toggle"));
    details!.open = false;
    fireEvent(details!, new Event("toggle"));

    expect(battlefieldTest.paused).toBe(true);
    expect(
      screen.getByRole("button", { name: "Resume battle" }),
    ).toBeInTheDocument();
  });

  it("pauses when a wave starts behind an already-open settings overlay", () => {
    renderGame();
    const menu = screen.getByLabelText("Battle settings");
    const details = menu.closest("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle"));

    fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));

    expect(battlefieldTest.paused).toBe(true);
  });

  it.each([
    [false, "0% charged"],
    [true, "25% charged"],
  ])(
    "handles away-state ticks when keep-playing is %s",
    async (keepPlayingWhileAway, expectedCharge) => {
      const pageActivity = new TestPageActivity();
      const activitySettings: Settings = {
        ...settings,
        keepPlayingWhileAway,
      };
      const unlockedRewardIds: readonly string[] = [];
      const modifierIds: readonly string[] = [];
      const view = render(
        <GameScreen
          levelId="muddy-moat"
          seed={7}
          modifierIds={modifierIds}
          unlockedRewardIds={unlockedRewardIds}
          checkpoint={null}
          settings={activitySettings}
          synchronizationBlocked={false}
          pageActivity={pageActivity}
          onCheckpoint={vi.fn()}
          onComplete={vi.fn()}
          onRetry={vi.fn()}
          onAbandon={vi.fn()}
          onSettings={vi.fn()}
        />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Start Wave 1" }));

      act(() => pageActivity.setAway(true));
      act(() => battlefieldTest.advance?.(60));
      expect(screen.getByText(expectedCharge)).toBeInTheDocument();

      view.rerender(
        <GameScreen
          levelId="muddy-moat"
          seed={7}
          modifierIds={modifierIds}
          unlockedRewardIds={unlockedRewardIds}
          checkpoint={null}
          settings={{
            ...activitySettings,
            keepPlayingWhileAway: !keepPlayingWhileAway,
          }}
          synchronizationBlocked={false}
          pageActivity={pageActivity}
          onCheckpoint={vi.fn()}
          onComplete={vi.fn()}
          onRetry={vi.fn()}
          onAbandon={vi.fn()}
          onSettings={vi.fn()}
        />,
      );
      await waitFor(() =>
        expect(battlefieldTest.paused).toBe(keepPlayingWhileAway),
      );
      act(() => battlefieldTest.advance?.(60));
      expect(screen.getByText("25% charged")).toBeInTheDocument();
    },
  );

  it("shows the background-play helper in battle settings", () => {
    renderGame();
    fireEvent.click(screen.getByLabelText("Battle settings"));

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

  it("explains compact defender choices on hover, focus, and touch without spending", () => {
    renderGame();
    const fork = screen.getByRole("button", {
      name: /Sir Stabs-a-Lot.*physical single-target damage.*57 gold/i,
    });

    fireEvent.pointerEnter(fork, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Sir Stabs-a-Lot");
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      /physical single-target damage.*range.*cadence.*57 gold/i,
    );
    expect(screen.getByText("270")).toBeInTheDocument();

    fireEvent.pointerLeave(fork, { pointerType: "mouse" });
    fireEvent.focus(fork);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.click(fork);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Sir Stabs-a-Lot");
    expect(screen.getByText("270")).toBeInTheDocument();
  });
});
