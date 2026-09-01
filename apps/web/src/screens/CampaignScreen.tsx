import {
  campaignNodes,
  modifierDefinitions,
  muddyMoatLevel,
} from "@srtg/game-core";
import type { Profile, SaveData } from "@srtg/protocol";
import { useState } from "react";

import { AccountPanel } from "../components/AccountPanel.js";
import { SettingsButton } from "../components/Settings.js";

interface CampaignScreenProps {
  readonly save: SaveData;
  readonly profile: Profile | null;
  readonly syncStatus: string;
  readonly installAvailable: boolean;
  readonly onInstall: () => void;
  readonly onStart: (modifierIds: readonly string[]) => void;
  readonly onResume: () => void;
  readonly onHome: () => void;
  readonly onOpenSettings: (trigger: HTMLButtonElement) => void;
}

export function CampaignScreen({
  save,
  profile,
  syncStatus,
  installAvailable,
  onInstall,
  onStart,
  onResume,
  onHome,
  onOpenSettings,
}: CampaignScreenProps) {
  const progress = save.campaign.levels["muddy-moat"];
  const [challenge, setChallenge] = useState(false);
  const challengeAvailable = (progress?.victories ?? 0) > 0;
  const completedMastery = new Set(progress?.completedMasteryIds ?? []);
  const unlocked = new Set(save.campaign.unlockedNodeIds);

  return (
    <main className="campaign-screen">
      <header className="topbar">
        <button className="brand-button" onClick={onHome}>
          <img src="/crest.svg" alt="" />
          <span>The Dubious Realm</span>
        </button>
        <div className="status-cluster">
          <span className={`sync-pill sync-${syncStatus}`}>
            <span className="status-dot" />
            {syncStatus}
          </span>
          {installAvailable && (
            <button
              className="button button-small button-ghost"
              onClick={onInstall}
            >
              Install
            </button>
          )}
          <SettingsButton onOpen={onOpenSettings} />
        </div>
      </header>

      <section className="campaign-heading">
        <div>
          <span className="eyebrow">Act I · Moist Consequences</span>
          <h1>The realm has selected its cheapest champions.</h1>
        </div>
        <p>
          Choose a route, earn mastery seals, and unlock tactical detours.
          Repeating a battle matters only when you try a genuinely different
          objective.
        </p>
      </section>

      <div className="campaign-layout">
        <section className="campaign-map card" aria-label="Campaign map">
          <div className="map-river map-river-one" aria-hidden="true" />
          <div className="map-river map-river-two" aria-hidden="true" />
          <svg className="map-routes" viewBox="0 0 100 100" aria-hidden="true">
            <path d="M18 55 C34 50 39 33 55 25" />
            <path d="M18 55 C42 62 58 65 78 70" />
          </svg>
          {campaignNodes.map((node, index) => {
            const isUnlocked = unlocked.has(node.id);
            const playable = node.levelId !== null;
            return (
              <button
                key={node.id}
                className={`campaign-node node-${index + 1} ${
                  isUnlocked ? "is-unlocked" : "is-locked"
                } ${playable ? "is-playable" : ""}`}
                style={{
                  left: `${node.position.x}%`,
                  top: `${node.position.y}%`,
                }}
                disabled={!playable}
                onClick={() => playable && onStart([])}
                aria-label={`${node.name}. ${node.description}`}
              >
                <span className="node-medallion">
                  {playable ? "I" : isUnlocked ? "?" : "×"}
                </span>
                <span className="node-label">
                  <strong>{node.name}</strong>
                  <small>
                    {playable
                      ? progress
                        ? `${progress.victories} ${
                            progress.victories === 1 ? "victory" : "victories"
                          }`
                        : "Playable"
                      : isUnlocked
                        ? "Route charted · coming later"
                        : "Uncharted"}
                  </small>
                </span>
              </button>
            );
          })}
          <div className="map-caption">
            <span>
              Map accuracy guaranteed by a cartographer with confidence.
            </span>
          </div>
        </section>

        <aside className="campaign-sidebar">
          <section className="mission-card card">
            <span className="eyebrow">Current calamity</span>
            <h2>{muddyMoatLevel.name}</h2>
            <p>{muddyMoatLevel.subtitle}</p>
            <div className="mission-stats">
              <span>
                <strong>6</strong> waves
              </span>
              <span>
                <strong>3</strong> heroes
              </span>
              <span>
                <strong>1</strong> labor dispute
              </span>
            </div>
            {save.checkpoint ? (
              <div className="mission-actions">
                <button className="button button-primary" onClick={onResume}>
                  Resume wave {save.checkpoint.nextWave + 1}
                </button>
                <button
                  className="button button-ghost"
                  onClick={() => onStart([])}
                >
                  Start over
                </button>
              </div>
            ) : (
              <button
                className="button button-primary button-wide"
                onClick={() => onStart(challenge ? ["stingy-king"] : [])}
              >
                Begin defense
              </button>
            )}
          </section>

          <section className="mastery-card card">
            <span className="eyebrow">Mastery seals</span>
            <ul className="mastery-list">
              {muddyMoatLevel.mastery.map((mastery) => (
                <li
                  key={mastery.id}
                  className={completedMastery.has(mastery.id) ? "complete" : ""}
                >
                  <span className="mastery-seal">
                    {completedMastery.has(mastery.id) ? "✓" : "◇"}
                  </span>
                  <span>
                    <strong>{mastery.name}</strong>
                    <small>{mastery.description}</small>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section
            className={`challenge-card card ${
              challengeAvailable ? "" : "is-disabled"
            }`}
          >
            <div>
              <span className="eyebrow">Optional detour</span>
              <h3>{modifierDefinitions["stingy-king"].name}</h3>
              <p>{modifierDefinitions["stingy-king"].description}</p>
            </div>
            <label className="switch">
              <input
                type="checkbox"
                checked={challenge}
                disabled={!challengeAvailable || Boolean(save.checkpoint)}
                onChange={(event) => setChallenge(event.target.checked)}
              />
              <span>
                {challenge ? "Active" : challengeAvailable ? "Off" : "Win once"}
              </span>
            </label>
          </section>

          <AccountPanel profile={profile} />
        </aside>
      </div>
    </main>
  );
}
