import type {
  BattleCheckpoint,
  BattleResult,
  CloudSave,
  Profile,
  SaveData,
  Settings,
} from "@srtg/protocol";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

import {
  acceptCloudSave,
  CloudSaveConflictError,
  overwriteCloudSave,
  synchronizeSave,
} from "./api.js";
import { CampaignScreen } from "./screens/CampaignScreen.js";
import { TitleScreen } from "./screens/TitleScreen.js";
import {
  createLocalSaveWriter,
  loadLocalSave,
  markLocalChange,
  type LocalSaveRecord,
} from "./storage.js";
import {
  unlockedRewardIds,
  withBattleResult,
  withCheckpoint,
  withoutBattleCheckpoint,
} from "./save.js";
import { reconcileCompletedSync } from "./sync-state.js";
import {
  createRetryBattleSetup,
  randomAttemptId,
  randomSeed,
  type BattleSetup,
} from "./battle-setup.js";

const GameScreen = lazy(async () => {
  const module = await import("./screens/GameScreen.js");
  return { default: module.GameScreen };
});

type Screen = "title" | "campaign" | "game";
type SyncStatus = "local" | "syncing" | "synced" | "offline" | "conflict";

export function App() {
  const [screen, setScreen] = useState<Screen>("title");
  const [record, setRecord] = useState<LocalSaveRecord | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [conflict, setConflict] = useState<CloudSave | null>(null);
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [battle, setBattle] = useState<BattleSetup | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const recordRef = useRef<LocalSaveRecord | null>(null);
  const conflictRef = useRef<CloudSave | null>(null);
  const conflictResolutionRef = useRef(false);
  const saveWriter = useRef(createLocalSaveWriter());
  const syncQueue = useRef<Promise<void>>(Promise.resolve());
  const submittedSaveData = useRef<SaveData[]>([]);

  useRegisterSW({
    onNeedReload: () => setUpdateReady(true),
  });

  const scheduleSync = useCallback(() => {
    const run = async () => {
      await saveWriter.current.flush();
      await Promise.resolve();
      const local = recordRef.current;
      if (!local || conflictRef.current) {
        return;
      }

      setSyncStatus("syncing");
      try {
        submittedSaveData.current = [
          ...submittedSaveData.current,
          local.data,
        ].slice(-20);
        const result = await synchronizeSave(local, submittedSaveData.current);
        if (result.type === "conflict") {
          setProfile(result.profile);
          conflictRef.current = result.remote;
          setConflict(result.remote);
          setSyncStatus("conflict");
          return;
        }

        setProfile(result.profile);
        const resolution = reconcileCompletedSync(
          local,
          recordRef.current,
          result.record,
        );
        if (resolution.type === "conflict") {
          conflictRef.current = resolution.remote;
          setConflict(resolution.remote);
          setSyncStatus("conflict");
          return;
        }
        const resolved = resolution.record;
        recordRef.current = resolved;
        setRecord(resolved);
        await saveWriter.current.store(resolved);
        setSyncStatus(resolved.pending ? "local" : "synced");
      } catch (error) {
        if (error instanceof CloudSaveConflictError) {
          conflictRef.current = error.remote;
          setConflict(error.remote);
          setSyncStatus("conflict");
        } else {
          setSyncStatus("offline");
        }
      }
    };

    syncQueue.current = syncQueue.current.then(run, run);
    return syncQueue.current;
  }, []);

  useEffect(() => {
    let active = true;
    void loadLocalSave()
      .then(async (loaded) => {
        if (!active) {
          return;
        }
        recordRef.current = loaded;
        setRecord(loaded);
        await saveWriter.current.store(loaded);
        scheduleSync();
      })
      .catch((error: unknown) => {
        if (active) {
          setFatalError(
            error instanceof Error
              ? error.message
              : "The save chest could not be opened.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [scheduleSync]);

  useEffect(() => {
    if (updateReady && screen !== "game") {
      location.reload();
    }
  }, [screen, updateReady]);

  useEffect(() => {
    const capture = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const retry = () => scheduleSync();
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("online", retry);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("online", retry);
    };
  }, [scheduleSync]);

  async function install() {
    if (!installPrompt) {
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  async function commit(data: SaveData): Promise<void> {
    const current = recordRef.current;
    if (!current) {
      throw new Error("The local save is not ready.");
    }
    const next = markLocalChange(current, data);
    recordRef.current = next;
    setRecord(next);
    setSyncStatus(navigator.onLine ? "local" : "offline");
    try {
      await saveWriter.current.store(next);
      scheduleSync();
    } catch (error) {
      if (recordRef.current === next) {
        recordRef.current = current;
        setRecord(current);
      }
      throw error;
    }
  }

  function updateSettings(settings: Settings) {
    if (recordRef.current) {
      void commit({ ...recordRef.current.data, settings }).catch(
        (error: unknown) => {
          setFatalError(
            error instanceof Error
              ? error.message
              : "The settings could not be stored locally.",
          );
        },
      );
    }
  }

  function beginBattle(
    levelId: string,
    modifierIds: readonly string[],
    checkpoint: BattleCheckpoint | null = null,
  ) {
    setBattle({
      levelId: checkpoint?.levelId ?? levelId,
      seed: checkpoint?.seed ?? randomSeed(),
      modifierIds: checkpoint?.modifierIds ?? modifierIds,
      unlockedRewardIds: recordRef.current
        ? unlockedRewardIds(recordRef.current.data)
        : [],
      checkpoint,
      attemptId: checkpoint?.attemptId ?? randomAttemptId(),
      loadoutSnapshot: checkpoint?.loadoutSnapshot ??
        recordRef.current?.data.loadouts ?? {
          "fork-knight": { weapon: null, armor: null, charm: null },
          "discount-wizard": { weapon: null, armor: null, charm: null },
          bardbarian: { weapon: null, armor: null, charm: null },
        },
      key: Date.now(),
    });
    setScreen("game");
  }

  async function startCampaignBattle(
    levelId: string,
    modifierIds: readonly string[],
    discardCheckpoint: boolean,
  ): Promise<void> {
    if (discardCheckpoint && recordRef.current?.data.checkpoint) {
      await commit(withoutBattleCheckpoint(recordRef.current.data));
    }
    beginBattle(levelId, modifierIds);
  }

  async function chooseLocal() {
    const local = recordRef.current;
    if (!local || !conflict || !profile || conflictResolutionRef.current) {
      return;
    }
    conflictResolutionRef.current = true;
    setResolvingConflict(true);
    setSyncStatus("syncing");
    try {
      const saved = await overwriteCloudSave(
        local,
        conflict.revision,
        profile.id,
      );
      const latest = recordRef.current;
      const resolved =
        latest && latest !== local
          ? {
              ...latest,
              cloudOwnerId: profile.id,
              cloudRevision: saved.cloudRevision,
              pending: true,
            }
          : saved;
      recordRef.current = resolved;
      setRecord(resolved);
      await saveWriter.current.store(resolved);
      conflictRef.current = null;
      setConflict(null);
      setSyncStatus(resolved.pending ? "local" : "synced");
      if (resolved.pending) {
        scheduleSync();
      }
    } catch (error) {
      if (error instanceof CloudSaveConflictError) {
        conflictRef.current = error.remote;
        setConflict(error.remote);
        setSyncStatus("conflict");
      } else {
        setSyncStatus("offline");
      }
    } finally {
      conflictResolutionRef.current = false;
      setResolvingConflict(false);
    }
  }

  async function chooseCloud() {
    if (!conflict || !profile || conflictResolutionRef.current) {
      return;
    }
    conflictResolutionRef.current = true;
    setResolvingConflict(true);
    try {
      const accepted = acceptCloudSave(conflict, profile.id);
      await saveWriter.current.store(accepted);
      recordRef.current = accepted;
      setRecord(accepted);
      conflictRef.current = null;
      setConflict(null);
      setSyncStatus("synced");
      setBattle(null);
      setScreen("campaign");
    } catch (error) {
      setFatalError(
        error instanceof Error
          ? error.message
          : "The chosen cloud save could not be stored locally.",
      );
    } finally {
      conflictResolutionRef.current = false;
      setResolvingConflict(false);
    }
  }

  if (fatalError) {
    return (
      <main className="fatal-screen">
        <img src="/crest.svg" alt="" />
        <h1>The save chest is stuck.</h1>
        <p>{fatalError}</p>
        <button
          className="button button-primary"
          onClick={() => location.reload()}
        >
          Try again
        </button>
      </main>
    );
  }

  if (!record) {
    return (
      <main className="loading-screen">
        <img src="/crest.svg" alt="" />
        <p>Consulting the royal save chest…</p>
      </main>
    );
  }

  return (
    <>
      <div
        className="app-surface"
        inert={conflict ? true : undefined}
        aria-hidden={conflict ? true : undefined}
      >
        {screen === "title" && (
          <TitleScreen
            installAvailable={Boolean(installPrompt)}
            onInstall={() => void install()}
            onContinue={() => setScreen("campaign")}
          />
        )}

        {screen === "campaign" && (
          <CampaignScreen
            save={record.data}
            profile={profile}
            syncStatus={syncStatus}
            installAvailable={Boolean(installPrompt)}
            onInstall={() => void install()}
            onStart={startCampaignBattle}
            onResume={() =>
              beginBattle(
                record.data.checkpoint?.levelId ?? "muddy-moat",
                [],
                record.data.checkpoint,
              )
            }
            onSettings={updateSettings}
            onHome={() => setScreen("title")}
          />
        )}

        {screen === "game" && battle && (
          <Suspense
            fallback={
              <main className="loading-screen">
                <img src="/crest.svg" alt="" />
                <p>Rolling the battlefield into position…</p>
              </main>
            }
          >
            <GameScreen
              key={battle.key}
              levelId={battle.levelId}
              seed={battle.seed}
              modifierIds={battle.modifierIds}
              unlockedRewardIds={battle.unlockedRewardIds}
              checkpoint={battle.checkpoint}
              attemptId={battle.attemptId}
              loadoutSnapshot={battle.loadoutSnapshot}
              settings={record.data.settings}
              synchronizationBlocked={Boolean(conflict)}
              onCheckpoint={(checkpoint) => {
                void commit(
                  withCheckpoint(recordRef.current!.data, checkpoint),
                ).catch((error: unknown) => {
                  setFatalError(
                    error instanceof Error
                      ? error.message
                      : "The battle checkpoint could not be stored locally.",
                  );
                });
              }}
              onComplete={async (result: BattleResult) => {
                await commit(withBattleResult(recordRef.current!.data, result));
                setScreen("campaign");
                setBattle(null);
              }}
              onRetry={() => setBattle(createRetryBattleSetup(battle))}
              onAbandon={async () => {
                await commit(withoutBattleCheckpoint(recordRef.current!.data));
                setScreen("campaign");
                setBattle(null);
              }}
              onSettings={updateSettings}
            />
          </Suspense>
        )}
      </div>

      {conflict && (
        <div className="modal-backdrop">
          <section
            className="conflict-dialog card"
            role="dialog"
            aria-modal="true"
          >
            <span className="eyebrow">Two save scrolls disagree</span>
            <h2>Which progress should survive?</h2>
            <p>
              This device changed while another cloud revision existed. Nothing
              has been overwritten.
            </p>
            <div className="conflict-options">
              <button
                className="button button-primary"
                onClick={() => void chooseLocal()}
                disabled={resolvingConflict}
              >
                {resolvingConflict ? "Resolving…" : "Keep this device"}
              </button>
              <button
                className="button button-ghost"
                onClick={() => void chooseCloud()}
                disabled={resolvingConflict}
              >
                Use cloud save
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
