import type { SaveData } from "@srtg/protocol";
import { useEffect, useRef, useState } from "react";

import "./DeveloperToolsPanel.css";

import {
  activateDevelopmentState,
  assertDevelopmentRuntime,
  clearDevelopmentState,
  grantTestResources,
  loadDevelopmentState,
  restoreDevelopmentSnapshot,
  storeDevelopmentState,
  TEST_RESOURCE_AMOUNT,
  type DevelopmentState,
} from "../developer-tools.js";

interface DeveloperToolsPanelProps {
  readonly save: SaveData;
  readonly localOnly: boolean;
  readonly cloudLinked: boolean;
  readonly identityPending: boolean;
  readonly synchronizationConflict: boolean;
  readonly onApplyLocalOnly: (save: SaveData) => Promise<void>;
  readonly onRestore: (save: SaveData) => Promise<void>;
  readonly onGoldFloorChange: (gold: number | null) => void;
}

export function DeveloperMissionBadge({ gold }: { readonly gold: number }) {
  assertDevelopmentRuntime();
  return (
    <div className="developer-mission-badge" role="status">
      TEST / DEVELOPMENT · Mission gold floor: {gold.toLocaleString()}
    </div>
  );
}

export function DeveloperToolsPanel({
  save,
  localOnly,
  cloudLinked,
  identityPending,
  synchronizationConflict,
  onApplyLocalOnly,
  onRestore,
  onGoldFloorChange,
}: DeveloperToolsPanelProps) {
  assertDevelopmentRuntime();
  const [state, setState] = useState<DevelopmentState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const dialog = useRef<HTMLElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const grantButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const stored = loadDevelopmentState();
      setState(stored);
      if (stored && localOnly) {
        onGoldFloorChange(
          stored.missionGoldEnabled ? TEST_RESOURCE_AMOUNT : null,
        );
      } else if (stored || localOnly) {
        setMessage(
          "The local-only marker and test snapshot disagree. Reset site data before using developer tools.",
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The development snapshot could not be loaded.",
      );
    } finally {
      setLoaded(true);
    }
  }, [localOnly, onGoldFloorChange]);

  useEffect(() => {
    if (!confirming) {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    cancelButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        event.preventDefault();
        setConfirming(false);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [busy, confirming]);

  const activationBlocked =
    !loaded ||
    busy ||
    cloudLinked ||
    identityPending ||
    synchronizationConflict ||
    Boolean(state) !== localOnly;

  async function grant(): Promise<void> {
    assertDevelopmentRuntime();
    if (activationBlocked) {
      throw new Error(
        "Test resources cannot be activated in the current state.",
      );
    }
    setBusy(true);
    setMessage(null);
    try {
      const nextState = activateDevelopmentState(save, state, true);
      storeDevelopmentState(nextState);
      await onApplyLocalOnly(grantTestResources(save));
      setState(nextState);
      onGoldFloorChange(TEST_RESOURCE_AMOUNT);
      setConfirming(false);
      setMessage(
        "Test resources active. This save is local-only until you restore the snapshot.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Test resources could not be activated.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function toggleMissionGold(enabled: boolean): Promise<void> {
    assertDevelopmentRuntime();
    if (activationBlocked) {
      throw new Error(
        "Test mission gold cannot be changed in the current state.",
      );
    }
    setBusy(true);
    setMessage(null);
    try {
      const nextState = activateDevelopmentState(save, state, enabled);
      storeDevelopmentState(nextState);
      await onApplyLocalOnly(save);
      setState(nextState);
      onGoldFloorChange(enabled ? TEST_RESOURCE_AMOUNT : null);
      setMessage(
        enabled
          ? "The next or resumed test battle will have at least 10,000 mission gold."
          : "The mission-gold override is off. The save remains local-only until reset.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The mission-gold override could not be changed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reset(): Promise<void> {
    assertDevelopmentRuntime();
    if (!state || busy) {
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await onRestore(restoreDevelopmentSnapshot(state));
      onGoldFloorChange(null);
      clearDevelopmentState();
      setState(null);
      setMessage(
        "Pre-test snapshot restored. Test battles and resource changes were removed.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The pre-test snapshot could not be restored.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section
        className="developer-tools card"
        aria-labelledby="developer-title"
      >
        <div className="developer-tools-heading">
          <div>
            <span className="developer-badge">TEST / DEVELOPMENT</span>
            <h2 id="developer-title">Developer tools</h2>
          </div>
          <strong>{localOnly ? "LOCAL ONLY" : "INACTIVE"}</strong>
        </div>
        <p>
          Never use this profile for normal play. Activation blocks cloud
          synchronization and snapshots the entire pre-test save.
        </p>
        {cloudLinked && (
          <p className="developer-warning" role="alert">
            Disabled: this browser is linked to a non-guest cloud account.
          </p>
        )}
        {identityPending && (
          <p className="developer-warning" role="status">
            Waiting for the cloud identity check before enabling test tools.
          </p>
        )}
        {synchronizationConflict && (
          <p className="developer-warning" role="alert">
            Resolve the save conflict before enabling test tools.
          </p>
        )}
        <dl className="developer-resource-list">
          <div>
            <dt>Quest Crowns</dt>
            <dd>set to at least 10,000</dd>
          </div>
          <div>
            <dt>Crafting Dust</dt>
            <dd>set to at least 10,000</dd>
          </div>
        </dl>
        <button
          ref={grantButton}
          type="button"
          className="button button-primary"
          disabled={activationBlocked}
          onClick={() => setConfirming(true)}
        >
          Grant test resources
        </button>
        <label className="developer-gold-toggle">
          <input
            type="checkbox"
            checked={state?.missionGoldEnabled ?? false}
            disabled={activationBlocked}
            onChange={(event) => void toggleMissionGold(event.target.checked)}
          />
          <span>
            <strong>Test mission gold: 10,000</strong>
            <small>
              Floors starting or resumed battle gold only. It does not grant
              campaign currency or count as spending. While this save is
              local-only, battle results, masteries, and rewards are not added
              to campaign progress.
            </small>
          </span>
        </label>
        <button
          type="button"
          className="button button-ghost"
          disabled={!state || busy}
          onClick={() => void reset()}
        >
          Restore pre-test snapshot
        </button>
        <small className="developer-reset-copy">
          Restore removes all changes made after activation, including test
          battles, while returning legitimate progress, inventory, loadouts,
          receipts, pity, and settings to their exact pre-test state.
        </small>
        {message && <p className="form-message">{message}</p>}
      </section>

      {confirming && (
        <div className="modal-backdrop">
          <section
            ref={dialog}
            className="developer-confirmation card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="developer-confirmation-title"
            aria-describedby="developer-confirmation-copy"
          >
            <span className="developer-badge">TEST / DEVELOPMENT</span>
            <h2 id="developer-confirmation-title">Grant test resources?</h2>
            <p id="developer-confirmation-copy">
              This sets Crowns and Dust to at least 10,000, enables the 10,000
              mission-gold floor, and makes the save local-only. Reset restores
              the complete snapshot captured now.
            </p>
            <div className="result-actions">
              <button
                ref={cancelButton}
                type="button"
                className="button button-ghost"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button button-primary"
                disabled={busy}
                onClick={() => void grant()}
              >
                {busy ? "Granting…" : "Confirm test grant"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
