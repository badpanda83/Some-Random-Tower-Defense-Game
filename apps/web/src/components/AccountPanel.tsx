import type { Profile } from "@srtg/protocol";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { sendMagicLink } from "../auth.js";

export type AccountSyncStatus =
  "local" | "local-only" | "syncing" | "synced" | "offline" | "conflict";

interface AccountPanelProps {
  readonly profile: Profile | null;
  readonly syncStatus: AccountSyncStatus;
  readonly onSignOut: () => Promise<void>;
}

const SYNC_COPY: Record<AccountSyncStatus, string> = {
  local: "Saved on this device. Cloud sync is waiting.",
  "local-only": "Test save is local-only. Cloud sync is blocked.",
  syncing: "Saving to the cloud now…",
  synced: "Cloud save is up to date.",
  offline: "Offline. Progress is safe here and will sync later.",
  conflict: "Two saves need your choice. Neither has been overwritten.",
};

export function AccountPanel({
  profile,
  syncStatus,
  onSignOut,
}: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const wasSignedIn = useRef(Boolean(profile && !profile.isAnonymous));

  useEffect(() => {
    const signedIn = Boolean(profile && !profile.isAnonymous);
    if (wasSignedIn.current && !signedIn) {
      emailInput.current?.focus();
    }
    wasSignedIn.current = signedIn;
  }, [profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      await sendMagicLink(email);
      setMessage(
        "Magic link sent. Open it on this device to sign in. We will then load that account's cloud save; if both saves have progress, you choose which one to keep.",
      );
      setEmail("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "The courier owl got lost.",
      );
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    setSigningOut(true);
    setMessage(null);
    try {
      await onSignOut();
      setMessage(
        "Signed out here. This device's progress is still safe. Enter an email below to switch accounts.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not switch accounts.",
      );
    } finally {
      setSigningOut(false);
    }
  }

  if (profile && !profile.isAnonymous) {
    return (
      <section className="account-panel card">
        <span className="eyebrow">Signed in and saving to cloud</span>
        <strong>{profile.email ?? profile.displayName}</strong>
        <p className="account-sync" role="status">
          {SYNC_COPY[syncStatus]}
        </p>
        <button
          className="button button-ghost button-small"
          type="button"
          onClick={() => void signOut()}
          disabled={signingOut}
        >
          {signingOut ? "Signing out…" : "Sign out / switch account"}
        </button>
        {message && (
          <p className="form-message" role="status">
            {message}
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="account-panel card">
      <span className="eyebrow">Account and cloud save</span>
      <h2>Save this guest progress</h2>
      <p>
        On your first device, enter an email to protect this adventure in the
        cloud. No password or royal paperwork.
      </p>
      <h3>Continue on another device</h3>
      <p>
        Already linked an email? Enter the same email and open the magic link.
        You will sign in to that account and load its cloud save. If this device
        also has progress, you choose which save survives—neither is silently
        overwritten.
      </p>
      <form onSubmit={submit}>
        <label>
          <span className="sr-only">Email for saving or signing in</span>
          <input
            ref={emailInput}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="hero@example.com"
            autoComplete="email"
            required
          />
        </label>
        <button
          className="button button-small"
          type="submit"
          disabled={sending}
        >
          {sending ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
      {message && (
        <p className="form-message" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
