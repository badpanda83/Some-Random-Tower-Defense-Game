import type { Settings } from "@srtg/protocol";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsButton, SettingsDialog } from "./Settings.js";

const initialSettings: Settings = {
  muted: false,
  reducedMotion: false,
  lowEffects: false,
  gameSpeed: 1,
  keepPlayingWhileAway: false,
};

function SettingsHarness() {
  const [settings, setSettings] = useState(initialSettings);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement | null>(null);

  return (
    <>
      <SettingsButton
        onOpen={(button) => {
          trigger.current = button;
          setOpen(true);
        }}
      />
      {open && (
        <SettingsDialog
          settings={settings}
          returnFocus={trigger.current}
          onChange={setSettings}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

describe("global settings", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("traps focus, closes with Escape, and returns focus to its trigger", async () => {
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    render(<SettingsHarness />);

    const trigger = screen.getByRole("button", { name: "Open settings" });
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Settings" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    const close = screen.getByRole("button", { name: "Close settings" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(
      screen.getByRole("checkbox", { name: /Keep playing while away/i }),
    ).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("exposes every persisted preference and the background limitation", () => {
    render(<SettingsHarness />);
    fireEvent.click(screen.getByRole("button", { name: "Open settings" }));

    expect(
      screen.getByRole("checkbox", { name: /Mute battle sounds/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Reduce motion/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Low-effects mode/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Double battle speed/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Keep playing while away/i }),
    ).not.toBeChecked();
    expect(
      screen.getByText(/may throttle or suspend background tabs/i),
    ).toBeInTheDocument();
  });
});
