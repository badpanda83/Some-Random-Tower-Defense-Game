import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const battlefieldTest = vi.hoisted(() => ({
  setPaused: vi.fn<(paused: boolean) => void>(),
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
          dispatch: (command: { type: "start-wave" }) => {
            state: unknown;
            events: readonly unknown[];
          };
        };
        onState: (state: unknown, events: readonly unknown[]) => void;
        onPauseChanged: (paused: boolean) => void;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        dispatch(command: { type: "start-wave" }) {
          const result = props.simulation.dispatch(command);
          props.onState(result.state, result.events);
        },
        confirmPlacement() {
          return false;
        },
        setPaused(paused: boolean) {
          battlefieldTest.setPaused(paused);
          props.onPauseChanged(paused);
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
};

function renderGame() {
  const callbacks = {
    onCheckpoint: vi.fn(),
    onComplete: vi.fn(),
    onRetry: vi.fn(),
    onAbandon: vi.fn(),
    onSettings: vi.fn(),
  };
  render(
    <GameScreen
      seed={7}
      modifierIds={[]}
      checkpoint={null}
      settings={settings}
      synchronizationBlocked={false}
      {...callbacks}
    />,
  );
  return callbacks;
}

describe("mission abandonment", () => {
  beforeEach(() => {
    battlefieldTest.setPaused.mockClear();
  });

  afterEach(cleanup);

  it("cancels with Escape and restores a running wave", () => {
    const callbacks = renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start wave 1" }));

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
    expect(screen.getByText(/Wave in progress/)).toBeInTheDocument();
    expect(callbacks.onAbandon).not.toHaveBeenCalled();
  });

  it("does not unpause a wave that was already paused", () => {
    renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Pause battle" }));
    battlefieldTest.setPaused.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue mission" }));

    expect(battlefieldTest.setPaused.mock.calls).toEqual([[true], [true]]);
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
        seed={7}
        modifierIds={[]}
        checkpoint={null}
        settings={settings}
        synchronizationBlocked={synchronizationBlocked}
        {...callbacks}
      />
    );
    const view = render(game(false));
    fireEvent.click(screen.getByRole("button", { name: "Start wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));

    view.rerender(game(true));
    view.rerender(game(false));

    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Continue mission" }));
    expect(battlefieldTest.setPaused).toHaveBeenLastCalledWith(false);
  });

  it("confirms abandonment during an active wave without recording a result", () => {
    const callbacks = renderGame();
    fireEvent.click(screen.getByRole("button", { name: "Start wave 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave mission" }));
    fireEvent.click(screen.getByRole("button", { name: "Abandon mission" }));

    expect(callbacks.onAbandon).toHaveBeenCalledOnce();
    expect(callbacks.onComplete).not.toHaveBeenCalled();
    expect(callbacks.onCheckpoint).not.toHaveBeenCalled();
  });
});
