import type { Profile } from "@srtg/protocol";

import {
  AccountPanel,
  type AccountSyncStatus,
} from "../components/AccountPanel.js";

interface TitleScreenProps {
  readonly installAvailable: boolean;
  readonly profile: Profile | null;
  readonly syncStatus: AccountSyncStatus;
  readonly onInstall: () => void;
  readonly onContinue: () => void;
  readonly onSignOut: () => Promise<void>;
}

export function TitleScreen({
  installAvailable,
  profile,
  syncStatus,
  onInstall,
  onContinue,
  onSignOut,
}: TitleScreenProps) {
  return (
    <main className="title-screen">
      <div className="title-stars" aria-hidden="true" />
      <section className="title-copy">
        <span className="eyebrow">A highly reputable defense concern</span>
        <img className="title-crest" src="/crest.svg" alt="" />
        <h1>
          The <em>Dubious</em> Realm
        </h1>
        <p className="title-tagline">
          Defend one damp kingdom with brave utensils, discount sorcery, and a
          bard who knows most of a chord.
        </p>
        <div className="title-actions">
          <button
            className="button button-primary button-hero"
            onClick={onContinue}
          >
            Enter the realm
          </button>
          {installAvailable && (
            <button className="button button-ghost" onClick={onInstall}>
              Install game
            </button>
          )}
        </div>
        <p className="title-footnote">
          Plays offline. Saves locally. No ads lurking under the bridge.
        </p>
        <div className="title-account">
          <AccountPanel
            profile={profile}
            syncStatus={syncStatus}
            onSignOut={onSignOut}
          />
        </div>
      </section>
      <div className="title-silhouette" aria-hidden="true">
        <span className="tower-silhouette tower-silhouette-one">♜</span>
        <span className="tower-silhouette tower-silhouette-two">♟</span>
        <span className="tower-silhouette tower-silhouette-three">♞</span>
      </div>
    </main>
  );
}
