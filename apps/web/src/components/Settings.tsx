import type { Settings } from "@srtg/protocol";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface SettingsButtonProps {
  readonly className?: string;
  readonly onOpen: (trigger: HTMLButtonElement) => void;
}

interface SettingsDialogProps {
  readonly settings: Settings;
  readonly returnFocus: HTMLButtonElement | null;
  readonly onChange: (settings: Settings) => void;
  readonly onClose: () => void;
}

export function SettingsButton({
  className = "",
  onOpen,
}: SettingsButtonProps) {
  return (
    <button
      className={`icon-button settings-button ${className}`.trim()}
      type="button"
      aria-label="Open settings"
      title="Settings"
      onClick={(event) => onOpen(event.currentTarget)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="6.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </svg>
    </button>
  );
}

export function SettingsDialog({
  settings,
  returnFocus,
  onChange,
  onClose,
}: SettingsDialogProps) {
  const dialog = useRef<HTMLElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }

      const focusable = Array.from(
        dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])',
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
      if (returnFocus?.isConnected) {
        requestAnimationFrame(() => returnFocus.focus());
      }
    };
  }, [onClose, returnFocus]);

  function update<Key extends keyof Settings>(key: Key, value: Settings[Key]) {
    onChange({ ...settings, [key]: value });
  }

  return createPortal(
    <div
      className="modal-backdrop settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        ref={dialog}
        className="settings-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
      >
        <div className="settings-dialog-heading">
          <div>
            <span className="eyebrow">Realm-wide preferences</span>
            <h2 id="settings-dialog-title">Settings</h2>
          </div>
          <button
            ref={closeButton}
            className="icon-button settings-close-button"
            type="button"
            aria-label="Close settings"
            title="Close settings"
            onClick={onClose}
          >
            ×
          </button>
        </div>
        <p id="settings-dialog-description">
          These preferences apply everywhere and travel with your save.
        </p>
        <div className="settings-options">
          <label>
            <input
              type="checkbox"
              checked={settings.muted}
              onChange={(event) => update("muted", event.target.checked)}
            />
            <span>
              <strong>Mute battle sounds</strong>
              <small>Silence tiny clashes, thuds, and heroic paperwork.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.reducedMotion}
              onChange={(event) =>
                update("reducedMotion", event.target.checked)
              }
            />
            <span>
              <strong>Reduce motion</strong>
              <small>Minimize animated movement and reactive effects.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.lowEffects}
              onChange={(event) => update("lowEffects", event.target.checked)}
            />
            <span>
              <strong>Low-effects mode</strong>
              <small>Use fewer battlefield particles and flourishes.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.gameSpeed === 2}
              onChange={(event) =>
                update("gameSpeed", event.target.checked ? 2 : 1)
              }
            />
            <span>
              <strong>Double battle speed</strong>
              <small>Run active combat at 2× instead of 1× speed.</small>
            </span>
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.keepPlayingWhileAway}
              onChange={(event) =>
                update("keepPlayingWhileAway", event.target.checked)
              }
            />
            <span>
              <strong>Keep playing while away</strong>
              <small>
                Continue an active battle when this page is hidden or loses
                focus. Phones and browsers may throttle or suspend background
                tabs, so uninterrupted play cannot be guaranteed.
              </small>
            </span>
          </label>
        </div>
      </section>
    </div>,
    document.body,
  );
}
