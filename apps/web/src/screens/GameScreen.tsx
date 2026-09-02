import {
  createSimulation,
  levelDefinitions,
  muddyMoatLevel,
  ROYAL_FORKFALL_CHARGE_TICKS,
  towerDefinitions,
  type GameEvent,
  type GameState,
} from "@srtg/game-core";
import {
  CONTENT_VERSION,
  type AbilityId,
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
  towerChoiceName,
  towerTacticalDescription,
} from "../game/tower-copy.js";

interface GameScreenProps {
  readonly levelId: string;
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly unlockedRewardIds: readonly string[];
  readonly checkpoint: BattleCheckpoint | null;
  readonly settings: Settings;
  readonly synchronizationBlocked: boolean;
  readonly onCheckpoint: (checkpoint: BattleCheckpoint) => void;
  readonly onComplete: (result: BattleResult) => Promise<void>;
  readonly onRetry: () => void;
  readonly onAbandon: () => Promise<void>;
  readonly onSettings: (settings: Settings) => void;
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
  levelId,
  seed,
  modifierIds,
  unlockedRewardIds,
  checkpoint,
  settings,
  synchronizationBlocked,
  onCheckpoint,
  onComplete,
  onRetry,
  onAbandon,
  onSettings,
}: GameScreenProps) {
  const simulation = useMemo(
    () =>
      createSimulation(
        checkpoint
          ? { checkpoint, unlockedRewardIds }
          : { seed, levelId, modifierIds, unlockedRewardIds },
      ),
    [checkpoint, levelId, modifierIds, seed, unlockedRewardIds],
  );
  const [state, setState] = useState<GameState>(simulation.state);
  const level =
    levelDefinitions[state.levelId as keyof typeof levelDefinitions] ??
    muddyMoatLevel;
  const [placementPreview, setPlacementPreview] =
    useState<PlacementPreview | null>(null);
  const [paused, setPaused] = useState(false);
  const [abilityArmed, setAbilityArmed] = useState(false);
  const [selectedAbility, setSelectedAbility] =
    useState<AbilityId>("royal-forkfall");
  const [towerInfoId, setTowerInfoId] = useState<string | null>(null);
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
  const quitPause = useRef<{ wasPaused: boolean } | null>(null);
  const quitSavingRef = useRef(false);
  const resultSavingRef = useRef(false);
  const completedResult = useRef<BattleResult | null>(null);
  const orientationPause = useRef<{ wasPaused: boolean } | null>(null);
  const checkpointSignature = useRef(
    checkpoint ? JSON.stringify(checkpoint) : "",
  );
  const audio = useRef(new GameAudio(settings.muted));
  const synchronizationPause = useRef({
    applied: false,
    wasPaused: false,
  });

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
    if (!message) {
      return;
    }
    const timer = window.setTimeout(() => setMessage(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!towerInfoId) {
      return;
    }
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTowerInfoId(null);
      }
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [towerInfoId]);

  useEffect(() => {
    if (!window.matchMedia) {
      return;
    }
    const portrait = window.matchMedia(
      "(orientation: portrait) and (max-width: 700px)",
    );
    const updateOrientation = () => {
      setPortraitBlocked(portrait.matches);
      if (
        portrait.matches &&
        state.phase === "active" &&
        !orientationPause.current
      ) {
        orientationPause.current = { wasPaused: paused };
        setAbilityArmed(false);
        battlefield.current?.setPaused(true);
      } else if (!portrait.matches && orientationPause.current) {
        const restorePaused = orientationPause.current.wasPaused;
        orientationPause.current = null;
        battlefield.current?.setPaused(
          quitOpen || synchronizationBlocked ? true : restorePaused,
        );
      }
    };
    updateOrientation();
    portrait.addEventListener("change", updateOrientation);
    return () => portrait.removeEventListener("change", updateOrientation);
  }, [paused, quitOpen, state.phase, synchronizationBlocked]);

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
      synchronizationBlocked &&
      state.phase === "active" &&
      !synchronizationPause.current.applied
    ) {
      synchronizationPause.current = {
        applied: true,
        wasPaused: quitPause.current?.wasPaused ?? paused,
      };
      battlefield.current?.setPaused(true);
    } else if (
      synchronizationBlocked &&
      synchronizationPause.current.applied &&
      !paused
    ) {
      battlefield.current?.setPaused(true);
    } else if (
      !synchronizationBlocked &&
      synchronizationPause.current.applied
    ) {
      const restorePaused = synchronizationPause.current.wasPaused;
      synchronizationPause.current.applied = false;
      battlefield.current?.setPaused(quitOpen ? true : restorePaused);
    }
  }, [paused, quitOpen, state.phase, synchronizationBlocked]);

  function handleState(next: GameState, events: readonly GameEvent[]) {
    audio.current.play(events);
    setState(next);
    if (next.phase !== "active") {
      setAbilityArmed(false);
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
    }
    const abilityEvent = events.find(
      (event) => event.type === "ability-activated",
    );
    if (abilityEvent?.type === "ability-activated") {
      setMessage(
        `Royal Forkfall struck for ${abilityEvent.damageDealt} damage!`,
      );
    }
    if (events.some((event) => event.type === "tea-break-activated")) {
      setMessage("Emergency Tea Break slowed every non-boss enemy!");
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
    const next = !paused;
    if (next) {
      setAbilityArmed(false);
    }
    battlefield.current?.setPaused(next);
    setPaused(next);
  }

  function requestQuit() {
    setAbilityArmed(false);
    quitPause.current = { wasPaused: paused };
    battlefield.current?.setPaused(true);
    setQuitOpen(true);
  }

  function cancelQuit() {
    const restorePaused = quitPause.current?.wasPaused ?? paused;
    quitPause.current = null;
    setQuitOpen(false);
    battlefield.current?.setPaused(
      synchronizationBlocked ? true : restorePaused,
    );
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
    setMessage(null);
    quitPause.current = null;
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
    const result =
      completedResult.current ??
      ({
        levelId: state.levelId,
        seed: state.seed,
        contentVersion: CONTENT_VERSION,
        modifierIds: [...state.modifierIds],
        result: state.phase === "victory" ? "victory" : "defeat",
        score: state.score,
        completedMasteryIds: [...state.completedMasteryIds],
        completedAt: new Date().toISOString(),
      } satisfies BattleResult);
    completedResult.current = result;
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
  const towerManagementDisabled =
    combatManagementDisabled || synchronizationBlocked;
  const abilityReady = state.abilityChargeTicks >= ROYAL_FORKFALL_CHARGE_TICKS;
  const abilityPercent = Math.round(
    (state.abilityChargeTicks / ROYAL_FORKFALL_CHARGE_TICKS) * 100,
  );
  const teaBreakUnlocked = unlockedRewardIds.includes("emergency-tea-break");
  const selectedAbilityReady =
    selectedAbility === "royal-forkfall"
      ? abilityReady
      : teaBreakUnlocked && !state.teaBreakUsedThisWave;
  const selectedAbilityName =
    selectedAbility === "royal-forkfall"
      ? "Royal Forkfall"
      : "Emergency Tea Break";
  const towerInfo = towerInfoId
    ? towerDefinitions[towerInfoId as keyof typeof towerDefinitions]
    : null;

  return (
    <main
      className="game-screen"
      inert={quitOpen ? true : undefined}
      aria-hidden={quitOpen ? true : undefined}
    >
      <div
        className="rotate-prompt"
        role="status"
        aria-live="polite"
        aria-hidden={!portraitBlocked}
      >
        <img src="/crest.svg" alt="" />
        <strong>Turn your phone sideways to defend the realm</strong>
        <span>
          Rotate to landscape. Battle resumes automatically when your phone is
          sideways.
        </span>
      </div>

      <header
        className={`game-hud ${
          state.phase === "preparing" && !quitOpen ? "has-wave-action" : ""
        }`}
      >
        <div className="hud-title">
          <span className="eyebrow">Act {level.act === 2 ? "II" : "I"}</span>
          <strong>{level.name}</strong>
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
              {Math.min(state.waveIndex + 1, level.waves.length)}/
              {level.waves.length}
            </strong>
          </span>
        </div>
        {state.phase === "preparing" && !quitOpen && (
          <button
            className={`button button-primary wave-launch-button ${
              settings.reducedMotion || settings.lowEffects ? "" : "is-pulsing"
            }`}
            aria-label={`Start Wave ${state.waveIndex + 1}`}
            aria-describedby={`wave-${state.waveIndex + 1}-threat`}
            onClick={() => {
              setPlacementPreview(null);
              if (battlefield.current?.dispatch({ type: "start-wave" })) {
                setMessage(`Wave ${state.waveIndex + 1} underway.`);
              }
            }}
          >
            <span>Start Wave {state.waveIndex + 1}</span>
            <small id={`wave-${state.waveIndex + 1}-threat`}>
              Next: {level.waves[state.waveIndex]?.name}
            </small>
          </button>
        )}
        <div className="hud-actions">
          <button
            className={`icon-button ${settings.gameSpeed === 2 ? "is-active" : ""}`}
            onClick={() => setSpeed(settings.gameSpeed === 1 ? 2 : 1)}
            disabled={synchronizationBlocked}
            aria-label="Change game speed"
          >
            {settings.gameSpeed}×
          </button>
          <button
            className={`icon-button ${paused ? "is-active" : ""}`}
            onClick={togglePause}
            disabled={state.phase !== "active" || synchronizationBlocked}
            aria-label={paused ? "Resume battle" : "Pause battle"}
          >
            {paused ? "▶" : "Ⅱ"}
          </button>
          <details className="battle-menu">
            <summary className="icon-button" aria-label="Battle settings">
              ⚙
            </summary>
            <div className="battle-menu-popover">
              <label>
                <input
                  type="checkbox"
                  checked={settings.muted}
                  onChange={(event) =>
                    onSettings({ ...settings, muted: event.target.checked })
                  }
                />
                Mute sounds
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.reducedMotion}
                  onChange={(event) =>
                    onSettings({
                      ...settings,
                      reducedMotion: event.target.checked,
                    })
                  }
                />
                Reduce motion
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={settings.lowEffects}
                  onChange={(event) =>
                    onSettings({
                      ...settings,
                      lowEffects: event.target.checked,
                    })
                  }
                />
                Low effects
              </label>
            </div>
          </details>
          <button
            ref={quitTrigger}
            className="icon-button leave-mission-button"
            onClick={requestQuit}
            disabled={synchronizationBlocked}
            aria-label="Leave mission"
          >
            ↩
          </button>
        </div>
      </header>

      <section className="battle-shell">
        <Battlefield
          ref={battlefield}
          simulation={simulation}
          placementPreview={placementPreview}
          managementDisabled={towerManagementDisabled}
          gameSpeed={settings.gameSpeed}
          lowEffects={settings.lowEffects}
          reducedMotion={settings.reducedMotion}
          onState={handleState}
          onTowerSelected={() => undefined}
          onPlacementPreview={(preview) => {
            if (towerManagementDisabled) {
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
          onPauseChanged={setPaused}
          onError={setMessage}
        />
        <div className="defender-dock" role="group" aria-label="Defender costs">
          {Object.values(towerDefinitions).map((tower) => (
            <button
              type="button"
              key={tower.id}
              className={`defender-dock-item tower-${tower.id}`}
              aria-label={`${towerChoiceName(tower)}. ${towerTacticalDescription(tower)}`}
              aria-describedby={
                towerInfoId === tower.id
                  ? "defender-dock-description"
                  : undefined
              }
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") {
                  setTowerInfoId(tower.id);
                }
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") {
                  setTowerInfoId(null);
                }
              }}
              onFocus={() => setTowerInfoId(tower.id)}
              onBlur={() => setTowerInfoId(null)}
              onClick={() => setTowerInfoId(tower.id)}
            >
              <span className="tower-portrait" aria-hidden="true">
                <TowerPortrait towerId={tower.id} />
              </span>
              <small>{tower.cost}g</small>
            </button>
          ))}
        </div>
        {towerInfo && (
          <aside
            id="defender-dock-description"
            className="defender-info-popover defender-dock-popover"
            role="tooltip"
          >
            <span>
              <strong>{towerChoiceName(towerInfo)}</strong>
              <small>{towerTacticalDescription(towerInfo)}</small>
            </span>
            <button
              type="button"
              onClick={() => setTowerInfoId(null)}
              aria-label="Dismiss defender details"
            >
              ×
            </button>
          </aside>
        )}
        <div
          className={`ability-control ${
            teaBreakUnlocked ? "has-selector" : ""
          } ${selectedAbilityReady ? "is-ready" : ""} ${
            abilityArmed ? "is-armed" : ""
          }`}
          role="group"
          aria-label={`${selectedAbilityName} ability`}
        >
          <div className="ability-copy">
            {teaBreakUnlocked ? (
              <select
                className="ability-select"
                value={selectedAbility}
                aria-label="Choose battlefield ability"
                onChange={(event) => {
                  setSelectedAbility(event.target.value as AbilityId);
                  setAbilityArmed(false);
                }}
              >
                <option value="royal-forkfall">Royal Forkfall</option>
                <option value="emergency-tea-break">Emergency Tea Break</option>
              </select>
            ) : (
              <span>
                <strong>Royal Forkfall</strong>
                <small>
                  {abilityReady ? "READY" : `${abilityPercent}% charged`}
                </small>
              </span>
            )}
            {selectedAbility === "royal-forkfall" ? (
              <progress
                value={state.abilityChargeTicks}
                max={ROYAL_FORKFALL_CHARGE_TICKS}
                aria-label="Royal Forkfall charge"
              />
            ) : (
              <small>
                {state.teaBreakUsedThisWave
                  ? "USED THIS WAVE"
                  : "SLOWS NON-BOSSES FOR 4S"}
              </small>
            )}
          </div>
          <button
            className="ability-button"
            disabled={
              !selectedAbilityReady ||
              state.phase !== "active" ||
              state.enemies.length === 0 ||
              paused ||
              synchronizationBlocked
            }
            aria-pressed={abilityArmed}
            onClick={() => {
              if (!abilityArmed) {
                setAbilityArmed(true);
                setMessage(
                  `${selectedAbilityName} armed. Press Cast to confirm.`,
                );
                return;
              }
              if (
                battlefield.current?.dispatch({
                  type: "activate-ability",
                  abilityId: selectedAbility,
                })
              ) {
                setAbilityArmed(false);
              }
            }}
          >
            {abilityArmed
              ? `Cast ${selectedAbility === "royal-forkfall" ? "Forkfall" : "Tea"}`
              : `Arm ${selectedAbility === "royal-forkfall" ? "Forkfall" : "Tea"}`}
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
            aria-live="polite"
          >
            {message}
          </button>
        )}
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
                ? `${level.name} is defended!`
                : "The gate filed for leave."}
            </h1>
            <p>
              {state.phase === "victory"
                ? `Final score ${state.score.toLocaleString()}. The kingdom has rounded this up to “legendary.”`
                : "Try a cheaper opening, a stronger bend in the path, or more utensils."}
            </p>
            {state.phase === "victory" && (
              <div className="result-masteries">
                {level.mastery.map((mastery) => (
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
