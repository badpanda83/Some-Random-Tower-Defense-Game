import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { Profile } from "@srtg/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";

import { sendMagicLink } from "../auth.js";
import { AccountPanel } from "./AccountPanel.js";

vi.mock("../auth.js", () => ({
  sendMagicLink: vi.fn().mockResolvedValue(undefined),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("account and cloud save panel", () => {
  it("explains saving a guest and returning on another device", async () => {
    render(
      <AccountPanel
        profile={null}
        syncStatus="local"
        onSignOut={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Save this guest progress" }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Continue on another device" }),
    ).toBeVisible();
    expect(
      screen.getByText(/enter the same email and open the magic link/i),
    ).toBeVisible();
    expect(screen.getByText(/neither is silently overwritten/i)).toBeVisible();

    fireEvent.change(
      screen.getByRole("textbox", { name: "Email for saving or signing in" }),
      { target: { value: "hero@example.test" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Email me a sign-in link" }),
    );

    await waitFor(() =>
      expect(sendMagicLink).toHaveBeenCalledWith("hero@example.test"),
    );
    expect(
      await screen.findByText(/load that account's cloud save/i),
    ).toBeVisible();
    expect(screen.getByText(/you choose which one to keep/i)).toBeVisible();
  });

  it("shows the signed-in identity, sync state, and account switch action", async () => {
    const profile: Profile = {
      id: "linked-user",
      displayName: "Linked Adventurer",
      isAnonymous: false,
      email: "hero@example.test",
    };
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <AccountPanel
        profile={profile}
        syncStatus="synced"
        onSignOut={onSignOut}
      />,
    );

    expect(screen.getByText("hero@example.test")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Cloud save is up to date.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Sign out / switch account" }),
    );
    await waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
    rerender(
      <AccountPanel profile={null} syncStatus="local" onSignOut={onSignOut} />,
    );
    expect(
      screen.getByRole("textbox", { name: "Email for saving or signing in" }),
    ).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent(
      /signed out here.*progress is still safe/i,
    );
  });
});
