import type { Profile } from "@srtg/protocol";
import { useState, type FormEvent } from "react";

import { sendMagicLink } from "../auth.js";

interface AccountPanelProps {
  readonly profile: Profile | null;
}

export function AccountPanel({ profile }: AccountPanelProps) {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setMessage(null);
    try {
      await sendMagicLink(email);
      setMessage(
        "Magic link dispatched. Check the inbox (and the mimic folder).",
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

  if (profile && !profile.isAnonymous) {
    return (
      <section className="account-panel card">
        <span className="eyebrow">Cloud oath active</span>
        <strong>{profile.displayName}</strong>
        <span className="muted">{profile.email}</span>
      </section>
    );
  }

  return (
    <section className="account-panel card">
      <span className="eyebrow">Protect this guest save</span>
      <p>
        Link an email to carry progress across devices. No password, no royal
        paperwork.
      </p>
      <form onSubmit={submit}>
        <label>
          <span className="sr-only">Email address</span>
          <input
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
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </form>
      {message && <p className="form-message">{message}</p>}
    </section>
  );
}
