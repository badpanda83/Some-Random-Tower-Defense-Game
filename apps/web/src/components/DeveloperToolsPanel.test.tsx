import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createFreshSave } from "../save.js";
import {
  activateDevelopmentState,
  clearDevelopmentState,
  loadDevelopmentState,
  storeDevelopmentState,
} from "../developer-tools.js";
import { DeveloperToolsPanel } from "./DeveloperToolsPanel.js";

afterEach(() => {
  cleanup();
  clearDevelopmentState();
});

function renderPanel(
  overrides: Partial<Parameters<typeof DeveloperToolsPanel>[0]> = {},
) {
  const callbacks = {
    onApplyLocalOnly: vi.fn().mockResolvedValue(undefined),
    onRestore: vi.fn().mockResolvedValue(undefined),
    onGoldFloorChange: vi.fn(),
  };
  render(
    <DeveloperToolsPanel
      save={createFreshSave()}
      localOnly={false}
      cloudLinked={false}
      identityPending={false}
      synchronizationConflict={false}
      {...callbacks}
      {...overrides}
    />,
  );
  return callbacks;
}

describe("developer tools panel", () => {
  it("requires a focused confirmation and activates a local-only preset", async () => {
    const callbacks = renderPanel();
    const request = await screen.findByRole("button", {
      name: "Grant test resources",
    });
    await waitFor(() => expect(request).toBeEnabled());

    fireEvent.click(request);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(callbacks.onApplyLocalOnly).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Confirm test grant" }));
    await waitFor(() =>
      expect(callbacks.onApplyLocalOnly).toHaveBeenCalledOnce(),
    );
    const granted = callbacks.onApplyLocalOnly.mock.calls[0]?.[0];
    expect(granted.economy.questCrowns).toBe(10_000);
    expect(granted.economy.craftingDust).toBe(10_000);
    expect(callbacks.onGoldFloorChange).toHaveBeenLastCalledWith(10_000);
    expect(loadDevelopmentState()?.missionGoldEnabled).toBe(true);
  });

  it("does not enable mutations for a linked cloud profile", async () => {
    renderPanel({ cloudLinked: true });

    const request = await screen.findByRole("button", {
      name: "Grant test resources",
    });
    expect(request).toBeDisabled();
    expect(
      screen.getByText(/linked to a non-guest cloud account/i),
    ).toBeVisible();
    expect(
      screen.getByRole("checkbox", { name: /Test mission gold/i }),
    ).toBeDisabled();
  });

  it("blocks activation when the local-only marker has no restore snapshot", async () => {
    renderPanel({ localOnly: true });

    const request = await screen.findByRole("button", {
      name: "Grant test resources",
    });
    expect(request).toBeDisabled();
    expect(
      screen.getByText(/local-only marker and test snapshot disagree/i),
    ).toBeVisible();
  });

  it("enables mission gold without changing campaign data", async () => {
    const callbacks = renderPanel();
    const toggle = await screen.findByRole("checkbox", {
      name: /Test mission gold/i,
    });
    await waitFor(() => expect(toggle).toBeEnabled());

    fireEvent.click(toggle);

    await waitFor(() =>
      expect(callbacks.onApplyLocalOnly).toHaveBeenCalledOnce(),
    );
    expect(callbacks.onApplyLocalOnly).toHaveBeenCalledWith(createFreshSave());
    expect(callbacks.onGoldFloorChange).toHaveBeenLastCalledWith(10_000);
  });

  it("keeps the active gold floor when snapshot restoration fails", async () => {
    storeDevelopmentState(
      activateDevelopmentState(createFreshSave(), null, true),
    );
    const callbacks = renderPanel({
      localOnly: true,
      onRestore: vi.fn().mockRejectedValue(new Error("disk full")),
    });
    const reset = await screen.findByRole("button", {
      name: "Restore pre-test snapshot",
    });
    await waitFor(() => expect(reset).toBeEnabled());

    fireEvent.click(reset);

    expect(await screen.findByText("disk full")).toBeVisible();
    expect(callbacks.onGoldFloorChange).not.toHaveBeenCalledWith(null);
    expect(loadDevelopmentState()).not.toBeNull();
  });
});
