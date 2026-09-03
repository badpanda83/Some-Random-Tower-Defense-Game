import {
  campaignNodes,
  enemyDefinitions,
  levelDefinitions,
  muddyMoatLevel,
  modifierDefinitions,
  rewardDefinitions,
} from "@srtg/game-core";
import type { Profile, SaveData, Settings } from "@srtg/protocol";
import { useEffect, useMemo, useRef, useState } from "react";

import { AccountPanel } from "../components/AccountPanel.js";
import { HubNavigation, type HubTab } from "../components/HubNavigation.js";
import { victoriousLevelIds } from "../save.js";

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
  readonly onNavigate?: (tab: HubTab) => void;
  readonly onTraining?: () => void;
  readonly onReplayBattleGuidance?: () => void;
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
  onNavigate = () => undefined,
  onTraining = () => undefined,
  onReplayBattleGuidance = () => undefined,
}: CampaignScreenProps) {
  const unlocked = useMemo(
    () => new Set(save.campaign.unlockedNodeIds),
    [save.campaign.unlockedNodeIds],
  );
  const playableNodes = campaignNodes.filter((node) => node.levelId !== null);
  const victoriousLevels = victoriousLevelIds(save);
  const finalPlayableNode = [...playableNodes].sort(
    (left, right) => right.order - left.order,
  )[0];
  const campaignCleared = victoriousLevels.has(
    finalPlayableNode?.levelId ?? "",
  );
  const actProgress = ([1, 2, 3] as const).map((act) => {
    const nodes = playableNodes.filter((node) => node.act === act);
    return {
      act,
      completed: nodes.filter((node) => victoriousLevels.has(node.levelId!))
        .length,
      total: nodes.length,
    };
  });
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
    : "Campaign epilogue";
  const rewardCopy = [nextUnlockCopy, ...rewardNames].join(" + ");
  const missionBoss = selectedLevel.waves
    .flatMap((wave) => wave.spawns)
    .map((spawn) => spawn.enemyId)
    .map(
      (enemyId) => enemyDefinitions[enemyId as keyof typeof enemyDefinitions],
    )
    .find((enemy) => enemy?.boss);

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
        <HubNavigation
          active="campaign"
          save={save}
          syncStatus={syncStatus}
          installAvailable={installAvailable}
          onInstall={onInstall}
          onHome={onHome}
          onNavigate={onNavigate}
        />

        <section className="campaign-heading">
          <div>
            <span className="eyebrow">
              Acts I–III · {playableNodes.length} playable missions
            </span>
            <h1>
              Ten authored calamities. One aggressively affordable defense
              force.
            </h1>
          </div>
          <p>
            Story victories open the next mission immediately. Three acts form a
            4/3/3 campaign; mastery seals and optional challenges add tactics,
            never grind.
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
              return (
                <button
                  key={node.id}
                  className={`campaign-node node-${index + 1} is-playable ${
                    isUnlocked ? "is-unlocked" : "is-locked"
                  } ${selected ? "is-selected" : ""}`}
                  style={{
                    left: `${node.position.x}%`,
                    top: `${node.position.y}%`,
                  }}
                  onClick={() => level && selectMission(level.id)}
                  aria-pressed={selected}
                  aria-disabled={!isUnlocked}
                  aria-label={`${node.name}. ${
                    isUnlocked ? "Unlocked." : "Locked."
                  } ${node.description}`}
                >
                  <span className="node-medallion">
                    {(nodeProgress?.victories ?? 0) > 0 ? "✓" : index + 1}
                  </span>
                  <span className="node-label">
                    <strong>{node.name}</strong>
                    <small>
                      {(nodeProgress?.victories ?? 0) > 0
                        ? `${nodeProgress!.victories} ${
                            nodeProgress!.victories === 1
                              ? "victory"
                              : "victories"
                          }`
                        : isUnlocked
                          ? `Act ${["I", "II", "III"][node.act - 1]} · ready`
                          : `Win mission ${Math.max(1, index)}`}
                    </small>
                  </span>
                </button>
              );
            })}
            <div className="act-boundary">
              <span className="eyebrow">Campaign ledger</span>
              {actProgress.map(({ act, completed, total }) => (
                <span className="act-progress" key={act}>
                  <strong>Act {["I", "II", "III"][act - 1]}</strong>
                  <small>
                    {completed}/{total} complete
                  </small>
                </span>
              ))}
            </div>
            {campaignCleared && (
              <div className="campaign-epilogue" role="status">
                <span className="eyebrow">10/10 · realm defended</span>
                <strong>The Quarterly Review is adjourned.</strong>
                <small>
                  Epilogue unlocked · Completion Crest · Executive Palette
                </small>
              </div>
            )}
            <div className="map-caption">
              <span>
                Ten playable battlefields. Zero preview-only assignments.
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
              <details className="mission-new">
                <summary>What is new here?</summary>
                <p>
                  {selectedLevel.mechanicSummary} Try mixing a precise defender
                  with splash or slow support.
                </p>
              </details>
              {missionBoss && (
                <div className="boss-briefing">
                  <strong>{missionBoss.name} resists hard control</strong>
                  <span>
                    Freeze, slime polymorph, and push use their listed boss-safe
                    slow, mark, or bonus-damage effect instead. Damage and
                    support still work.
                  </span>
                </div>
              )}
              <p className="mission-threat">
                <strong>Threats:</strong> {selectedLevel.threatSummary}
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
                <button className="button button-ghost" onClick={onTraining}>
                  Enter Training Tent
                </button>
                <button
                  className="button button-ghost"
                  onClick={onReplayBattleGuidance}
                >
                  Replay battle help
                </button>
                <details className="glossary">
                  <summary>RPG glossary</summary>
                  <dl>
                    <dt>Splash</dt>
                    <dd>Hits enemies near the main target.</dd>
                    <dt>Slow</dt>
                    <dd>Makes route movement slower for a short time.</dd>
                    <dt>Freeze</dt>
                    <dd>Stops a normal enemy for up to one second.</dd>
                    <dt>Proc</dt>
                    <dd>An item trick that triggers on some primary hits.</dd>
                    <dt>Pity</dt>
                    <dd>A visible maximum wait for guaranteed rarity.</dd>
                    <dt>Boss resistance</dt>
                    <dd>Turns hard control into a safe listed effect.</dd>
                  </dl>
                </details>
                <label className="setting-with-help">
                  <input
                    type="checkbox"
                    checked={save.settings.muted}
                    onChange={(event) =>
                      updateSetting("muted", event.target.checked)
                    }
                  />
                  <span>
                    <strong>Mute tiny battle noises</strong>
                  </span>
                </label>
                <label className="setting-with-help">
                  <input
                    type="checkbox"
                    checked={save.settings.reducedMotion}
                    onChange={(event) =>
                      updateSetting("reducedMotion", event.target.checked)
                    }
                  />
                  <span>
                    <strong>Reduce motion</strong>
                  </span>
                </label>
                <label className="setting-with-help">
                  <input
                    type="checkbox"
                    checked={save.settings.lowEffects}
                    onChange={(event) =>
                      updateSetting("lowEffects", event.target.checked)
                    }
                  />
                  <span>
                    <strong>Low-effects mode</strong>
                  </span>
                </label>
                <label className="setting-with-help">
                  <input
                    type="checkbox"
                    checked={save.settings.keepPlayingWhileAway}
                    onChange={(event) =>
                      updateSetting(
                        "keepPlayingWhileAway",
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    <strong>Keep playing while away</strong>
                    <small>
                      When enabled, switching tabs or windows will not
                      intentionally pause the simulation. Mobile browsers and
                      operating systems may throttle or suspend background tabs,
                      so uninterrupted play cannot be guaranteed.
                    </small>
                  </span>
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
