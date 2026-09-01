import {
  createSimulation,
  muddyMoatLevel,
  ROYAL_FORKFALL_CHARGE_TICKS,
  TICK_RATE,
  towerDefinitions,
  type GameEvent,
  type GameState,
  type TowerState,
} from "@srtg/game-core";
import {
  CONTENT_VERSION,
  type BattleCheckpoint,
  type BattleResult,
  type GameSpeed,
  type Settings,
} from "@srtg/protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  Battlefield,
  type BattlefieldHandle,
  type PlacementPreview,
} from "../game/Battlefield.js";
import { GameAudio } from "../game/audio.js";
import {
  browserPageActivity,
  type PageActivitySource,
} from "../page-activity.js";
import { SettingsButton } from "../components/Settings.js";

interface GameScreenProps {
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly checkpoint: BattleCheckpoint | null;
  readonly settings: Settings;
  readonly settingsOpen: boolean;
  readonly synchronizationBlocked: boolean;
  readonly onCheckpoint: (checkpoint: BattleCheckpoint) => void;
  readonly onComplete: (result: BattleResult) => Promise<void>;
  readonly onRetry: () => void;
  readonly onAbandon: () => Promise<void>;
  readonly onSettings: (settings: Settings) => void;
  readonly onOpenSettings: (trigger: HTMLButtonElement) => void;
  readonly pageActivity?: PageActivitySource;
}

function TowerPortrait({ towerId }: { readonly towerId: string }) {
  if (towerId === "fork-knight") {
    return (
      <svg viewBox="0 0 48 48" role="img" aria-label="Fork Knight portrait">
        <path d="M9 42 13 23h20l6 19Z" fill="#6d3852" />
        <path d="M15 25V14a9 9 0 0 1 18 0v11Z" fill="#cbd6d8" />
        <path
          d="m17 14 7-10 7 10M16 19h17"
          fill="none"
          stroke="#303943"
          strokeWidth="3"
        />
        <circle cx="28" cy="18" r="2" fill="#332738" />
        <path
          d="M37 42V9m-5 0v-6m5 6V3m5 6V3M32 9h10"
          fill="none"
          stroke="#f3d58a"
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="31"
          r="7"
          fill="#8f4d62"
          stroke="#f3d58a"
          strokeWidth="2"
        />
      </svg>
    );
  }
  if (towerId === "discount-wizard") {
    return (
      <svg viewBox="0 0 48 48" role="img" aria-label="Discount Wizard portrait">
        <path d="m7 43 11-26h15l9 26Z" fill="#4d3271" />
        <path d="m8 18 17-16 15 17Z" fill="#764ca0" />
        <circle cx="25" cy="21" r="8" fill="#f0c2a7" />
        <path d="m19 26 13-1-6 14Z" fill="#e6e1d5" />
        <circle cx="22" cy="20" r="1.6" fill="#332738" />
        <circle cx="28" cy="20" r="1.6" fill="#332738" />
        <path d="M37 42 42 10" stroke="#8b603d" strokeWidth="3" />
        <circle
          cx="42"
          cy="9"
          r="5"
          fill="#ffe989"
          stroke="#fff5c8"
          strokeWidth="2"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 48 48" role="img" aria-label="Bardbarian portrait">
      <path d="M8 43 13 22h22l5 21Z" fill="#325f56" />
      <circle cx="24" cy="17" r="9" fill="#efb88f" />
      <path d="m15 12 9-10 9 10" fill="#203b38" />
      <circle cx="21" cy="17" r="1.6" fill="#332738" />
      <circle cx="27" cy="17" r="1.6" fill="#332738" />
      <ellipse
        cx="32"
        cy="32"
        rx="10"
        ry="12"
        fill="#8b5533"
        stroke="#f4dfaa"
        strokeWidth="2"
      />
      <circle cx="32" cy="32" r="3" fill="#2c1c19" />
      <path d="M24 40 39 19M14 26 6 37" stroke="#e6c778" strokeWidth="3" />
    </svg>
  );
}

export function GameScreen({
  seed,
  modifierIds,
  checkpoint,
  settings,
  settingsOpen,
  synchronizationBlocked,
  onCheckpoint,
  onComplete,
  onRetry,
  onAbandon,
  onSettings,
  onOpenSettings,
  pageActivity = browserPageActivity,
}: GameScreenProps) {
  const simulation = useMemo(
    () =>
      createSimulation(
        checkpoint
          ? { checkpoint }
          : { seed, levelId: "muddy-moat", modifierIds },
      ),
    [checkpoint, modifierIds, seed],
  );
  const [state, setState] = useState<GameState>(simulation.state);
  const [selectedTowerId, setSelectedTowerId] = useState<string | null>(null);
  const [placementPreview, setPlacementPreview] =
    useState<PlacementPreview | null>(null);
  const [selectedTower, setSelectedTower] = useState<TowerState | null>(null);
  const [manualPaused, setManualPaused] = useState(false);
  const [pageAway, setPageAway] = useState(() => pageActivity.isAway());
  const [abilityArmed, setAbilityArmed] = useState(false);
  const [portraitBlocked, setPortraitBlocked] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [quitSaving, setQuitSaving] = useState(false);
  const [quitError, setQuitError] = useState<string | null>(null);
  const [resultSaving, setResultSaving] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(
    checkpoint ? "Recovered your between-wave camp." : null,
  );
  const battlefield = useRef<BattlefieldHandle>(null);
  const quitDialog = useRef<HTMLElement>(null);
  const cancelQuitButton = useRef<HTMLButtonElement>(null);
  const quitTrigger = useRef<HTMLButtonElement>(null);
  const quitSavingRef = useRef(false);
  const resultSavingRef = useRef(false);
  const checkpointSignature = useRef(
    checkpoint ? JSON.stringify(checkpoint) : "",
  );
  const audio = useRef(new GameAudio(settings.muted));
  const paused =
    manualPaused ||
    settingsOpen ||
    portraitBlocked ||
    quitOpen ||
    synchronizationBlocked ||
    (pageAway && !settings.keepPlayingWhileAway);

  useEffect(
    () => () => {
      void audio.current.close();
    },
    [],
  );

  useEffect(() => {
    audio.current.setMuted(settings.muted);
  }, [settings.muted]);

  useEffect(() => {
    const updateActivity = () => setPageAway(pageActivity.isAway());
    updateActivity();
    return pageActivity.subscribe(updateActivity);
  }, [pageActivity]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }
    const portrait = window.matchMedia(
      "(orientation: portrait) and (max-width: 700px)",
    );
    const updateOrientation = () => {
      setPortraitBlocked(portrait.matches);
      if (portrait.matches) {
        setAbilityArmed(false);
      }
    };
    updateOrientation();
    portrait.addEventListener("change", updateOrientation);
    return () => portrait.removeEventListener("change", updateOrientation);
  }, []);

  useEffect(() => {
    if (!quitOpen) {
      return;
    }
    cancelQuitButton.current?.focus();
    const cancelWithEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelQuit();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const buttons = Array.from(
        quitDialog.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      const first = buttons[0];
      const last = buttons.at(-1);
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
    window.addEventListener("keydown", cancelWithEscape);
    return () => window.removeEventListener("keydown", cancelWithEscape);
  }, [quitOpen]);

  useEffect(() => {
    if (
      settingsOpen ||
      portraitBlocked ||
      quitOpen ||
      synchronizationBlocked ||
      (pageAway && !settings.keepPlayingWhileAway)
    ) {
      setAbilityArmed(false);
    }
  }, [
    pageAway,
    portraitBlocked,
    quitOpen,
    settings.keepPlayingWhileAway,
    settingsOpen,
    synchronizationBlocked,
  ]);

  const inspected = selectedTower
    ? (state.towers.find((tower) => tower.id === selectedTower.id) ?? null)
    : null;
  const inspectedDefinition = inspected
    ? towerDefinitions[inspected.towerId as keyof typeof towerDefinitions]
    : null;
  const inspectedLevel =
    inspectedDefinition && inspected
      ? inspectedDefinition.levels[inspected.level - 1]
      : null;
  const wave = muddyMoatLevel.waves[state.waveIndex];

  function handleState(next: GameState, events: readonly GameEvent[]) {
    audio.current.play(events);
    setState(next);
    if (selectedTower) {
      setSelectedTower(
        next.towers.find((tower) => tower.id === selectedTower.id) ?? null,
      );
    }
    if (next.phase === "preparing") {
      const nextCheckpoint = simulation.createCheckpoint();
      const signature = nextCheckpoint ? JSON.stringify(nextCheckpoint) : "";
      if (nextCheckpoint && signature !== checkpointSignature.current) {
        checkpointSignature.current = signature;
        onCheckpoint(nextCheckpoint);
        if (next.waveIndex > 0) {
          setMessage(`Wave ${next.waveIndex} survived. Camp autosaved.`);
        }
      }
    }
    if (next.phase === "victory" || next.phase === "defeat") {
      setPlacementPreview(null);
      setSelectedTowerId(null);
      setAbilityArmed(false);
    }
    const abilityEvent = events.find(
      (event) => event.type === "ability-activated",
    );
    if (abilityEvent?.type === "ability-activated") {
      setMessage(
        `Royal Forkfall struck for ${abilityEvent.damageDealt} damage!`,
      );
    }
  }

  function setSpeed(speed: GameSpeed) {
    battlefield.current?.setSpeed(speed);
    onSettings({ ...settings, gameSpeed: speed });
  }

  function togglePause() {
    if (synchronizationBlocked) {
      return;
    }
    const next = !manualPaused;
    if (next) {
      setAbilityArmed(false);
    }
    setManualPaused(next);
  }

  function requestQuit() {
    setAbilityArmed(false);
    setQuitOpen(true);
  }

  function cancelQuit() {
    setQuitOpen(false);
    requestAnimationFrame(() => quitTrigger.current?.focus());
  }

  async function confirmQuit() {
    if (quitSavingRef.current) {
      return;
    }
    quitSavingRef.current = true;
    setQuitSaving(true);
    setQuitError(null);
    setPlacementPreview(null);
    setSelectedTowerId(null);
    setSelectedTower(null);
    setMessage(null);
    try {
      await onAbandon();
    } catch (error) {
      setQuitError(
        error instanceof Error
          ? error.message
          : "Mission progress could not be cleared locally.",
      );
      quitSavingRef.current = false;
      setQuitSaving(false);
    }
  }

  async function finish() {
    if (resultSavingRef.current) {
      return;
    }
    resultSavingRef.current = true;
    setResultSaving(true);
    setResultError(null);
    const result: BattleResult = {
      levelId: state.levelId,
      seed: state.seed,
      contentVersion: CONTENT_VERSION,
      modifierIds: [...state.modifierIds],
      result: state.phase === "victory" ? "victory" : "defeat",
      score: state.score,
      completedMasteryIds: [...state.completedMasteryIds],
      completedAt: new Date().toISOString(),
    };
    try {
      await onComplete(result);
    } catch (error) {
      setResultError(
        error instanceof Error
          ? error.message
          : "The result could not be stored locally.",
      );
      resultSavingRef.current = false;
      setResultSaving(false);
    }
  }

  const combatManagementDisabled =
    state.phase !== "preparing" && state.phase !== "active";
  const sellingDisabled = state.phase !== "preparing";
  const previewDefinition = placementPreview
    ? towerDefinitions[
        placementPreview.towerId as keyof typeof towerDefinitions
      ]
    : null;
  const remainingEnemies =
    state.phase === "active" && wave
      ? state.enemies.length + wave.spawns.length - state.nextSpawnIndex
      : 0;
  const abilityReady = state.abilityChargeTicks >= ROYAL_FORKFALL_CHARGE_TICKS;
  const abilityPercent = Math.round(
    (state.abilityChargeTicks / ROYAL_FORKFALL_CHARGE_TICKS) * 100,
  );

  function cancelPlacement() {
    setPlacementPreview(null);
  }

  function confirmPlacement() {
    if (
      !placementPreview ||
      !previewDefinition ||
      combatManagementDisabled ||
      state.gold < previewDefinition.cost
    ) {
      return;
    }
    if (battlefield.current?.confirmPlacement(placementPreview)) {
      setPlacementPreview(null);
      setSelectedTowerId(null);
      setMessage(`${previewDefinition.shortName} deployed.`);
    }
  }

  return (
    <main
      className="game-screen"
      inert={quitOpen || settingsOpen ? true : undefined}
      aria-hidden={quitOpen || settingsOpen ? true : undefined}
    >
      <div
        className="rotate-prompt"
        role="status"
        aria-live="polite"
        aria-hidden={!portraitBlocked}
      >
        <img src="/crest.svg" alt="" />
        <strong>Turn your phone sideways to defend the moat</strong>
        <span>
          Rotate to landscape. Battle resumes automatically when your phone is
          sideways.
        </span>
        <SettingsButton
          className="rotate-settings-button"
          onOpen={onOpenSettings}
        />
      </div>

      <header className="game-hud">
        <div className="hud-title">
          <span className="eyebrow">Act I</span>
          <strong>{muddyMoatLevel.name}</strong>
        </div>
        <div className="hud-resources">
          <span className="resource resource-lives">
            <small>Gate</small>
            <strong>{state.lives}</strong>
          </span>
          <span className="resource resource-gold">
            <small>Gold-ish</small>
            <strong>{state.gold}</strong>
          </span>
          <span className="resource">
            <small>Wave</small>
            <strong>
              {Math.min(state.waveIndex + 1, muddyMoatLevel.waves.length)}/
              {muddyMoatLevel.waves.length}
            </strong>
          </span>
        </div>
        <div className="hud-actions">
          {!portraitBlocked &&
            state.phase !== "victory" &&
            state.phase !== "defeat" && (
              <SettingsButton onOpen={onOpenSettings} />
            )}
          <button
            ref={quitTrigger}
            className="quit-mission-button"
            onClick={requestQuit}
            disabled={synchronizationBlocked}
          >
            Leave mission
          </button>
          <button
            className="icon-button"
            onClick={() => {
              audio.current.setMuted(!settings.muted);
              onSettings({ ...settings, muted: !settings.muted });
            }}
            disabled={synchronizationBlocked}
            aria-label={settings.muted ? "Unmute game" : "Mute game"}
          >
            {settings.muted ? "×♪" : "♪"}
          </button>
          <button
            className={`icon-button ${settings.gameSpeed === 2 ? "is-active" : ""}`}
            onClick={() => setSpeed(settings.gameSpeed === 1 ? 2 : 1)}
            disabled={synchronizationBlocked}
            aria-label="Change game speed"
          >
            {settings.gameSpeed}×
          </button>
          <button
            className={`icon-button ${manualPaused ? "is-active" : ""}`}
            onClick={togglePause}
            disabled={state.phase !== "active" || synchronizationBlocked}
            aria-label={manualPaused ? "Resume battle" : "Pause battle"}
          >
            {manualPaused ? "▶" : "Ⅱ"}
          </button>
        </div>
      </header>

      <section className="battle-shell">
        <Battlefield
          ref={battlefield}
          simulation={simulation}
          selectedTowerId={selectedTowerId}
          placementPreview={placementPreview}
          paused={paused}
          gameSpeed={settings.gameSpeed}
          lowEffects={settings.lowEffects}
          reducedMotion={settings.reducedMotion}
          onState={handleState}
          onTowerSelected={setSelectedTower}
          onPlacementPreview={(preview) => {
            if (combatManagementDisabled) {
              setPlacementPreview(null);
              setMessage("The battle is already decided.");
              return;
            }
            setPlacementPreview(preview);
            if (preview) {
              const definition =
                towerDefinitions[
                  preview.towerId as keyof typeof towerDefinitions
                ];
              setMessage(
                `${definition.shortName} previewed. Confirm to spend ${definition.cost}g.`,
              );
            }
          }}
          onError={setMessage}
        />
        <div
          className={`ability-control ${abilityReady ? "is-ready" : ""} ${
            abilityArmed ? "is-armed" : ""
          }`}
        >
          <div className="ability-copy">
            <span>
              <strong>Royal Forkfall</strong>
              <small>
                {abilityReady ? "READY" : `${abilityPercent}% charged`}
              </small>
            </span>
            <progress
              value={state.abilityChargeTicks}
              max={ROYAL_FORKFALL_CHARGE_TICKS}
              aria-label="Royal Forkfall charge"
            />
          </div>
          <button
            className="ability-button"
            disabled={
              !abilityReady ||
              state.phase !== "active" ||
              state.enemies.length === 0 ||
              paused ||
              synchronizationBlocked
            }
            aria-pressed={abilityArmed}
            onClick={() => {
              if (!abilityArmed) {
                setAbilityArmed(true);
                setMessage("Forkfall armed. Press Cast to confirm.");
                return;
              }
              if (battlefield.current?.dispatch({ type: "activate-ability" })) {
                setAbilityArmed(false);
              }
            }}
          >
            {abilityArmed ? "Cast Forkfall" : "Arm Forkfall"}
          </button>
        </div>
        {paused && state.phase === "active" && (
          <div className="pause-stamp">TACTICAL THINKING BREAK</div>
        )}
        {message && (
          <button
            className="toast"
            onClick={() => setMessage(null)}
            aria-label="Dismiss message"
          >
            {message}
          </button>
        )}
      </section>

      <section className="battle-controls">
        <div className="tower-shop" aria-label="Hero roster">
          {Object.values(towerDefinitions).map((tower) => {
            const selected = selectedTowerId === tower.id;
            return (
              <button
                key={tower.id}
                className={`tower-card tower-${tower.id} ${
                  selected ? "is-selected" : ""
                }`}
                onClick={() => {
                  setSelectedTowerId(tower.id);
                  setSelectedTower(null);
                  setPlacementPreview(null);
                  setMessage(`${tower.shortName} selected. Tap an empty pad.`);
                }}
                disabled={combatManagementDisabled}
                aria-pressed={selected}
              >
                <span className="tower-portrait" aria-hidden="true">
                  <TowerPortrait towerId={tower.id} />
                </span>
                <span>
                  <strong>{tower.shortName}</strong>
                  <small>{tower.description}</small>
                </span>
                <b>{tower.cost}g</b>
              </button>
            );
          })}
        </div>

        <div className="wave-panel">
          {placementPreview && previewDefinition ? (
            <div className="placement-panel" aria-live="polite">
              <span className={`tower-portrait tower-${previewDefinition.id}`}>
                <TowerPortrait towerId={previewDefinition.id} />
              </span>
              <div>
                <span className="eyebrow">Placement preview</span>
                <strong>{previewDefinition.shortName}</strong>
                <small>
                  Deploy for {previewDefinition.cost} gold
                  {state.gold < previewDefinition.cost
                    ? ` · need ${previewDefinition.cost - state.gold} more`
                    : ""}
                </small>
              </div>
              <div className="placement-actions">
                <button
                  className="button button-small button-ghost"
                  onClick={cancelPlacement}
                >
                  Cancel
                </button>
                <button
                  className="button button-small button-primary"
                  onClick={confirmPlacement}
                  disabled={
                    combatManagementDisabled ||
                    state.gold < previewDefinition.cost
                  }
                >
                  Confirm {previewDefinition.cost}g
                </button>
              </div>
            </div>
          ) : inspected && inspectedDefinition && inspectedLevel ? (
            <div className="inspection-panel">
              <div>
                <span className="eyebrow">Hero inspection</span>
                <strong>
                  {inspectedDefinition.name} · rank {inspected.level}
                </strong>
                <small>
                  {inspectedLevel.damage} damage · {inspectedLevel.range} range
                  {inspectedDefinition.slowTicks > 0
                    ? ` · ${inspectedDefinition.slowPercent}% slow for ${
                        inspectedDefinition.slowTicks / TICK_RATE
                      }s (non-refreshing)`
                    : ""}
                </small>
              </div>
              <div className="inspection-actions">
                <button
                  className="button button-small button-primary"
                  disabled={
                    combatManagementDisabled ||
                    inspectedLevel.upgradeCost === null ||
                    state.gold < (inspectedLevel.upgradeCost ?? 0)
                  }
                  onClick={() =>
                    battlefield.current?.dispatch({
                      type: "upgrade-tower",
                      instanceId: inspected.id,
                    })
                  }
                >
                  {inspectedLevel.upgradeCost === null
                    ? "Max rank"
                    : `Upgrade ${inspectedLevel.upgradeCost}g`}
                </button>
                <button
                  className="button button-small button-danger"
                  disabled={sellingDisabled}
                  onClick={() => {
                    battlefield.current?.dispatch({
                      type: "sell-tower",
                      instanceId: inspected.id,
                    });
                    setSelectedTower(null);
                  }}
                >
                  Sell {Math.floor(inspected.investedGold * 0.7)}g
                </button>
              </div>
            </div>
          ) : (
            <div className="wave-copy">
              <span className="eyebrow">
                {state.phase === "preparing"
                  ? "Scouts report"
                  : "Currently regretting"}
              </span>
              <strong>{wave?.name ?? "The paperwork afterward"}</strong>
              <small>
                {wave?.preview ?? "No enemies remain to provide feedback."}
              </small>
            </div>
          )}

          {!placementPreview && (
            <div className="wave-actions">
              {state.phase === "preparing" && (
                <button
                  className="button button-primary"
                  onClick={() => {
                    cancelPlacement();
                    setSelectedTowerId(null);
                    battlefield.current?.dispatch({ type: "start-wave" });
                  }}
                >
                  Start wave {state.waveIndex + 1}
                </button>
              )}
              {state.phase === "active" && (
                <span className="wave-live">
                  <span className="status-dot" /> Wave in progress ·{" "}
                  {remainingEnemies}{" "}
                  {remainingEnemies === 1 ? "enemy" : "enemies"} remaining ·
                  Build + upgrade
                </span>
              )}
            </div>
          )}
        </div>
      </section>

      {(state.phase === "victory" || state.phase === "defeat") && (
        <div className="result-backdrop">
          <section className={`result-card result-${state.phase}`}>
            <span className="eyebrow">
              {state.phase === "victory"
                ? "Officially defensible"
                : "Gate-related incident"}
            </span>
            <h1>
              {state.phase === "victory"
                ? "The moat is defended!"
                : "The gate filed for leave."}
            </h1>
            <p>
              {state.phase === "victory"
                ? `Final score ${state.score.toLocaleString()}. The kingdom has rounded this up to “legendary.”`
                : "Try a cheaper opening, a stronger bend in the path, or more utensils."}
            </p>
            {state.phase === "victory" && (
              <div className="result-masteries">
                {muddyMoatLevel.mastery.map((mastery) => (
                  <span
                    key={mastery.id}
                    className={
                      state.completedMasteryIds.includes(mastery.id)
                        ? "earned"
                        : ""
                    }
                  >
                    {state.completedMasteryIds.includes(mastery.id) ? "✓" : "◇"}{" "}
                    {mastery.name}
                  </span>
                ))}
              </div>
            )}
            {resultError && (
              <p className="result-save-error" role="alert">
                Could not save your result: {resultError} Your victory is still
                here; try again.
              </p>
            )}
            <div className="result-actions">
              <button
                className="button button-ghost"
                onClick={onRetry}
                disabled={resultSaving}
              >
                Retry
              </button>
              <button
                className="button button-primary"
                onClick={() => void finish()}
                disabled={resultSaving}
              >
                {resultSaving ? "Saving result…" : "Continue to campaign"}
              </button>
            </div>
            <SettingsButton
              className="result-settings-button"
              onOpen={onOpenSettings}
            />
          </section>
        </div>
      )}
      {quitOpen &&
        createPortal(
          <div className="modal-backdrop">
            <section
              ref={quitDialog}
              className="quit-dialog card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="quit-dialog-title"
              aria-describedby="quit-dialog-description"
            >
              <span className="eyebrow">Retreat with dignity-ish</span>
              <h2 id="quit-dialog-title">Leave this mission?</h2>
              <p id="quit-dialog-description">
                Your current mission progress will be lost. Earlier campaign
                progress, settings, and account data will stay safe.
              </p>
              {quitError && (
                <p className="result-save-error" role="alert">
                  Could not leave safely: {quitError} Try again.
                </p>
              )}
              <div className="quit-dialog-actions">
                <button
                  ref={cancelQuitButton}
                  className="button button-ghost"
                  onClick={cancelQuit}
                  disabled={quitSaving}
                >
                  Continue mission
                </button>
                <button
                  className="button button-danger"
                  onClick={() => void confirmQuit()}
                  disabled={quitSaving}
                >
                  {quitSaving ? "Leaving safely…" : "Abandon mission"}
                </button>
              </div>
            </section>
          </div>,
          document.body,
        )}
    </main>
  );
}
