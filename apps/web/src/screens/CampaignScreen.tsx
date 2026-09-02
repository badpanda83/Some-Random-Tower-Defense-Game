import {
  campaignNodes,
  levelDefinitions,
  muddyMoatLevel,
  modifierDefinitions,
  rewardDefinitions,
} from "@srtg/game-core";
import type { Profile, SaveData, Settings } from "@srtg/protocol";
import { useEffect, useMemo, useRef, useState } from "react";

import { AccountPanel } from "../components/AccountPanel.js";

interface CampaignScreenProps {
  readonly save: SaveData;
  readonly profile: Profile | null;
  readonly syncStatus: string;
  readonly installAvailable: boolean;
  readonly onInstall: () => void;
  readonly onStart: (
    levelId: string,
    modifierIds: readonly string[],
    discardCheckpoint: boolean,
  ) => Promise<void>;
  readonly onResume: () => void;
  readonly onSettings: (settings: Settings) => void;
  readonly onHome: () => void;
}

function levelById(levelId: string) {
  return levelDefinitions[levelId as keyof typeof levelDefinitions];
}

export function CampaignScreen({
  save,
  profile,
  syncStatus,
  installAvailable,
  onInstall,
  onStart,
  onResume,
  onSettings,
  onHome,
}: CampaignScreenProps) {
  const unlocked = useMemo(
    () => new Set(save.campaign.unlockedNodeIds),
    [save.campaign.unlockedNodeIds],
  );
  const playableNodes = campaignNodes.filter((node) => node.levelId !== null);
  const totalNodeCount = campaignNodes.length;
  const completedCount = campaignNodes.filter(
    (node) => (save.campaign.levels[node.levelId ?? ""]?.victories ?? 0) > 0,
  ).length;
  const finalPlayableNode = [...playableNodes].sort(
    (left, right) => right.order - left.order,
  )[0];
  const actTwoCleared =
    (save.campaign.levels[finalPlayableNode?.levelId ?? ""]?.victories ?? 0) >
    0;
  const initialLevelId =
    save.checkpoint?.levelId ??
    [...campaignNodes]
      .reverse()
      .find((node) => node.levelId && unlocked.has(node.id))?.levelId ??
    "muddy-moat";
  const [selectedLevelId, setSelectedLevelId] = useState(initialLevelId);
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [pendingStart, setPendingStart] = useState<{
    readonly levelId: string;
    readonly modifierIds: readonly string[];
  } | null>(null);
  const [starting, setStarting] = useState(false);
  const startTrigger = useRef<HTMLButtonElement>(null);
  const replaceDialog = useRef<HTMLElement>(null);
  const keepCampButton = useRef<HTMLButtonElement>(null);
  const selectedLevel = levelById(selectedLevelId) ?? muddyMoatLevel;
  const selectedNode =
    campaignNodes.find((node) => node.levelId === selectedLevel.id) ??
    campaignNodes[0]!;
  const progress = save.campaign.levels[selectedLevel.id];
  const completedMastery = new Set(progress?.completedMasteryIds ?? []);
  const challengeAvailable = (progress?.victories ?? 0) > 0;
  const availableModifiers = selectedLevel.availableModifierIds
    .map((id) => modifierDefinitions[id as keyof typeof modifierDefinitions])
    .filter((modifier) => Boolean(modifier));
  const checkpointMatches = save.checkpoint?.levelId === selectedLevel.id;
  const selectedUnlocked = unlocked.has(selectedNode.id);
  const missionNumber =
    campaignNodes.findIndex((node) => node.id === selectedNode.id) + 1;
  const nextNode = campaignNodes.find(
    (node) => node.order === selectedNode.order + 1,
  );
  const rewardNames = selectedLevel.rewardIds.map(
    (rewardId) =>
      rewardDefinitions[rewardId as keyof typeof rewardDefinitions]?.name ??
      rewardId,
  );
  const nextUnlockCopy = nextNode?.levelId
    ? nextNode.name
    : "Act III coming next";
  const rewardCopy = [nextUnlockCopy, ...rewardNames].join(" + ");

  useEffect(() => {
    if (!pendingStart) {
      return;
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    keepCampButton.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !starting) {
        event.preventDefault();
        setPendingStart(null);
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const focusable = Array.from(
        replaceDialog.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  }, [pendingStart, starting]);

  function updateSetting<Key extends keyof Settings>(
    key: Key,
    value: Settings[Key],
  ) {
    onSettings({ ...save.settings, [key]: value });
  }

  function selectMission(levelId: string) {
    setSelectedLevelId(levelId);
    setChallengeId(null);
  }

  function requestStart() {
    const modifierIds = challengeId ? [challengeId] : [];
    if (save.checkpoint) {
      setPendingStart({ levelId: selectedLevel.id, modifierIds });
      return;
    }
    void start(selectedLevel.id, modifierIds, false);
  }

  async function start(
    levelId: string,
    modifierIds: readonly string[],
    discardCheckpoint: boolean,
  ) {
    if (starting) {
      return;
    }
    setStarting(true);
    try {
      await onStart(levelId, modifierIds, discardCheckpoint);
    } finally {
      setStarting(false);
    }
  }

  return (
    <main className="campaign-screen">
      <div
        className="campaign-content"
        inert={pendingStart ? true : undefined}
        aria-hidden={pendingStart ? true : undefined}
      >
        <header className="topbar">
          <button className="brand-button" onClick={onHome}>
            <img src="/crest.svg" alt="" />
            <span>The Dubious Realm</span>
          </button>
          <div className="status-cluster">
            <span className="campaign-progress">
              <strong>
                {completedCount}/{totalNodeCount}
              </strong>{" "}
              missions
            </span>
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
          </div>
        </header>

        <section className="campaign-heading">
          <div>
            <span className="eyebrow">
              Act I &amp; II · {playableNodes.length} playable missions
            </span>
            <h1>
              Seven authored calamities. One aggressively affordable defense
              force.
            </h1>
          </div>
          <p>
            Story victories open the next mission immediately. Mastery seals and
            optional challenges add tactics, never grind. Act III is charted but
            not yet built.
          </p>
        </section>

        <div className="campaign-layout">
          <section className="campaign-map card" aria-label="Campaign map">
            <div className="map-river map-river-one" aria-hidden="true" />
            <div className="map-river map-river-two" aria-hidden="true" />
            <svg
              className="map-routes"
              viewBox="0 0 100 100"
              aria-hidden="true"
            >
              <path d="M14 72 C28 60 30 32 43 27 S61 63 71 55 S79 27 88 20" />
            </svg>
            {campaignNodes.map((node, index) => {
              const isUnlocked = unlocked.has(node.id);
              const level = node.levelId ? levelById(node.levelId) : undefined;
              const nodeProgress = node.levelId
                ? save.campaign.levels[node.levelId]
                : undefined;
              const selected = node.levelId === selectedLevel.id;
              const isPreview = node.levelId === null;
              return (
                <button
                  key={node.id}
                  className={`campaign-node node-${index + 1} ${
                    isPreview
                      ? "is-preview"
                      : `is-playable ${isUnlocked ? "is-unlocked" : "is-locked"}`
                  } ${selected ? "is-selected" : ""}`}
                  style={{
                    left: `${node.position.x}%`,
                    top: `${node.position.y}%`,
                  }}
                  onClick={() => level && selectMission(level.id)}
                  aria-pressed={selected}
                  aria-disabled={isPreview || !isUnlocked}
                  aria-label={`${node.name}. ${
                    isPreview
                      ? "Not yet available."
                      : isUnlocked
                        ? "Unlocked."
                        : "Locked."
                  } ${node.description}`}
                >
                  <span className="node-medallion">
                    {isPreview
                      ? "…"
                      : (nodeProgress?.victories ?? 0) > 0
                        ? "✓"
                        : index + 1}
                  </span>
                  <span className="node-label">
                    <strong>{node.name}</strong>
                    <small>
                      {isPreview
                        ? "Act III · coming later"
                        : (nodeProgress?.victories ?? 0) > 0
                          ? `${nodeProgress!.victories} ${
                              nodeProgress!.victories === 1
                                ? "victory"
                                : "victories"
                            }`
                          : isUnlocked
                            ? "Ready to defend"
                            : `Win mission ${Math.max(1, index)}`}
                    </small>
                  </span>
                </button>
              );
            })}
            <div className="act-boundary">
              <span className="eyebrow">Beyond the keep</span>
              <strong>
                {actTwoCleared
                  ? "Act III passage earned"
                  : "Act III lies ahead"}
              </strong>
              <small>
                Coming in a future campaign layer · no preview mission is
                playable yet
              </small>
            </div>
            <div className="map-caption">
              <span>
                Seven authored battlefields. Zero procedurally renamed moats.
              </span>
            </div>
          </section>

          <aside className="campaign-sidebar">
            <section className="mission-card card">
              <span className="eyebrow">
                Mission {missionNumber} ·{" "}
                {selectedUnlocked ? "Unlocked" : "Locked"}
              </span>
              <h2>{selectedLevel.name}</h2>
              <p>{selectedLevel.subtitle}</p>
              <p className="mission-mechanic">
                {selectedLevel.mechanicSummary}
              </p>
              <div className="mission-stats">
                <span>
                  <strong>{selectedLevel.waves.length}</strong> waves
                </span>
                <span>
                  <strong>~{selectedLevel.estimatedMinutes}</strong> minutes
                </span>
                <span>
                  <strong>{progress?.victories ?? 0}</strong> victories
                </span>
              </div>
              <p className="mission-reward">
                <strong>First-clear reward:</strong> {rewardCopy}
              </p>
              {checkpointMatches ? (
                <div className="mission-actions">
                  <button className="button button-primary" onClick={onResume}>
                    Resume wave {save.checkpoint!.nextWave + 1}
                  </button>
                  <button
                    ref={startTrigger}
                    className="button button-ghost"
                    onClick={requestStart}
                    disabled={starting}
                  >
                    Start over
                  </button>
                </div>
              ) : (
                <button
                  ref={startTrigger}
                  className="button button-primary button-wide"
                  onClick={requestStart}
                  disabled={!selectedUnlocked || starting}
                >
                  {selectedUnlocked
                    ? starting
                      ? "Preparing battlefield…"
                      : "Begin defense"
                    : `Win mission ${Math.max(1, missionNumber - 1)} to unlock`}
                </button>
              )}
            </section>

            <section className="mastery-card card">
              <span className="eyebrow">Mastery seals</span>
              <ul className="mastery-list">
                {selectedLevel.mastery.map((mastery) => (
                  <li
                    key={mastery.id}
                    className={
                      completedMastery.has(mastery.id) ? "complete" : ""
                    }
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

            {availableModifiers.length > 0 && (
              <section
                className={`challenge-card card ${
                  challengeAvailable ? "" : "is-disabled"
                }`}
              >
                <div>
                  <span className="eyebrow">Optional detour</span>
                  <h3>
                    {challengeId
                      ? modifierDefinitions[
                          challengeId as keyof typeof modifierDefinitions
                        ].name
                      : "Choose a challenge"}
                  </h3>
                  <p>
                    {challengeId
                      ? modifierDefinitions[
                          challengeId as keyof typeof modifierDefinitions
                        ].description
                      : challengeAvailable
                        ? "A harder authored ruleset with no story gate."
                        : "Win this mission once to unlock its challenge."}
                  </p>
                </div>
                <select
                  value={challengeId ?? ""}
                  disabled={!challengeAvailable || checkpointMatches}
                  onChange={(event) =>
                    setChallengeId(event.target.value || null)
                  }
                  aria-label="Mission challenge"
                >
                  <option value="">Normal</option>
                  {availableModifiers.map((modifier) => (
                    <option key={modifier.id} value={modifier.id}>
                      {modifier.name}
                    </option>
                  ))}
                </select>
              </section>
            )}

            <details className="settings-card card">
              <summary>Traveling settings cart</summary>
              <div className="settings-grid">
                <label>
                  <input
                    type="checkbox"
                    checked={save.settings.muted}
                    onChange={(event) =>
                      updateSetting("muted", event.target.checked)
                    }
                  />
                  Mute tiny battle noises
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={save.settings.reducedMotion}
                    onChange={(event) =>
                      updateSetting("reducedMotion", event.target.checked)
                    }
                  />
                  Reduce motion
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={save.settings.lowEffects}
                    onChange={(event) =>
                      updateSetting("lowEffects", event.target.checked)
                    }
                  />
                  Low-effects mode
                </label>
              </div>
            </details>

            <AccountPanel profile={profile} />
          </aside>
        </div>
      </div>

      {pendingStart && (
        <div className="modal-backdrop">
          <section
            ref={replaceDialog}
            className="quit-dialog card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-camp-title"
          >
            <span className="eyebrow">One camp at a time</span>
            <h2 id="replace-camp-title">Discard the current checkpoint?</h2>
            <p>
              Your saved camp in{" "}
              {levelById(save.checkpoint?.levelId ?? "")?.name ??
                "another mission"}{" "}
              will be removed before this battle starts.
            </p>
            <div className="result-actions">
              <button
                ref={keepCampButton}
                className="button button-ghost"
                onClick={() => setPendingStart(null)}
                disabled={starting}
              >
                Keep current camp
              </button>
              <button
                className="button button-danger"
                onClick={() => {
                  const requested = pendingStart;
                  setPendingStart(null);
                  void start(requested.levelId, requested.modifierIds, true);
                }}
                disabled={starting}
              >
                Discard and begin
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
