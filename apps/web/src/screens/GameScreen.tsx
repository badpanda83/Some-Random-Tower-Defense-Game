import {
  createSimulation,
  muddyMoatLevel,
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

import { Battlefield, type BattlefieldHandle } from "../game/Battlefield.js";
import { GameAudio } from "../game/audio.js";

interface GameScreenProps {
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly checkpoint: BattleCheckpoint | null;
  readonly settings: Settings;
  readonly synchronizationBlocked: boolean;
  readonly onCheckpoint: (checkpoint: BattleCheckpoint) => void;
  readonly onComplete: (result: BattleResult) => void;
  readonly onRetry: () => void;
  readonly onExit: () => void;
  readonly onSettings: (settings: Settings) => void;
}

export function GameScreen({
  seed,
  modifierIds,
  checkpoint,
  settings,
  synchronizationBlocked,
  onCheckpoint,
  onComplete,
  onRetry,
  onExit,
  onSettings,
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
  const [selectedTowerId, setSelectedTowerId] = useState("fork-knight");
  const [selectedTower, setSelectedTower] = useState<TowerState | null>(null);
  const [paused, setPaused] = useState(false);
  const [message, setMessage] = useState<string | null>(
    checkpoint ? "Recovered your between-wave camp." : null,
  );
  const battlefield = useRef<BattlefieldHandle>(null);
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
    if (
      synchronizationBlocked &&
      state.phase === "active" &&
      !synchronizationPause.current.applied
    ) {
      synchronizationPause.current = {
        applied: true,
        wasPaused: paused,
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
      battlefield.current?.setPaused(restorePaused);
    }
  }, [paused, state.phase, synchronizationBlocked]);

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
    battlefield.current?.setPaused(next);
    setPaused(next);
  }

  function finish() {
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
    onComplete(result);
  }

  const managementDisabled = state.phase !== "preparing";

  return (
    <main className="game-screen">
      <div className="rotate-prompt">
        <img src="/crest.svg" alt="" />
        <strong>Rotate the royal viewing rectangle</strong>
        <span>The moat needs a little more elbow room.</span>
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
            className={`icon-button ${paused ? "is-active" : ""}`}
            onClick={togglePause}
            disabled={state.phase !== "active" || synchronizationBlocked}
            aria-label={paused ? "Resume battle" : "Pause battle"}
          >
            {paused ? "▶" : "Ⅱ"}
          </button>
        </div>
      </header>

      <section className="battle-shell">
        <Battlefield
          ref={battlefield}
          simulation={simulation}
          selectedTowerId={selectedTowerId}
          gameSpeed={settings.gameSpeed}
          lowEffects={settings.lowEffects}
          reducedMotion={settings.reducedMotion}
          onState={handleState}
          onTowerSelected={setSelectedTower}
          onPauseChanged={setPaused}
          onError={setMessage}
        />
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
                  setMessage(`${tower.shortName} selected. Tap an empty pad.`);
                }}
                disabled={managementDisabled}
              >
                <span className="tower-portrait" aria-hidden="true">
                  {tower.id === "fork-knight"
                    ? "♜"
                    : tower.id === "discount-wizard"
                      ? "✦"
                      : "♫"}
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
          {inspected && inspectedDefinition && inspectedLevel ? (
            <div className="inspection-panel">
              <div>
                <span className="eyebrow">Hero inspection</span>
                <strong>
                  {inspectedDefinition.name} · rank {inspected.level}
                </strong>
                <small>
                  {inspectedLevel.damage} damage · {inspectedLevel.range} range
                </small>
              </div>
              <div className="inspection-actions">
                <button
                  className="button button-small button-primary"
                  disabled={
                    managementDisabled ||
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
                  disabled={managementDisabled}
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

          <div className="wave-actions">
            {state.phase === "preparing" && (
              <>
                <button className="button button-ghost" onClick={onExit}>
                  Map
                </button>
                <button
                  className="button button-primary"
                  onClick={() =>
                    battlefield.current?.dispatch({ type: "start-wave" })
                  }
                >
                  Start wave {state.waveIndex + 1}
                </button>
              </>
            )}
            {state.phase === "active" && (
              <span className="wave-live">
                <span className="status-dot" /> Wave in progress
              </span>
            )}
          </div>
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
                ? "The moat remains dubious!"
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
            <div className="result-actions">
              <button className="button button-ghost" onClick={onRetry}>
                Retry
              </button>
              <button className="button button-primary" onClick={finish}>
                Record result
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
