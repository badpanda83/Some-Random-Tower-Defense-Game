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
  loadLocalSave,
  markLocalChange,
  storeLocalSave,
  type LocalSaveRecord,
} from "./storage.js";
import {
  withBattleResult,
  withCheckpoint,
  withoutBattleCheckpoint,
} from "./save.js";
import { reconcileCompletedSync } from "./sync-state.js";

const GameScreen = lazy(async () => {
  const module = await import("./screens/GameScreen.js");
  return { default: module.GameScreen };
});

type Screen = "title" | "campaign" | "game";
type SyncStatus = "local" | "syncing" | "synced" | "offline" | "conflict";

interface BattleSetup {
  readonly seed: number;
  readonly modifierIds: readonly string[];
  readonly checkpoint: BattleCheckpoint | null;
  readonly key: number;
}

function randomSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return ((values[0] ?? 1) % 2_147_483_646) + 1;
}

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
  const recordRef = useRef<LocalSaveRecord | null>(null);
  const conflictRef = useRef<CloudSave | null>(null);
  const conflictResolutionRef = useRef(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const syncQueue = useRef<Promise<void>>(Promise.resolve());

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const scheduleSync = useCallback(() => {
    const run = async () => {
      const local = recordRef.current;
      if (!local || conflictRef.current) {
        return;
      }

      setSyncStatus("syncing");
      try {
        const result = await synchronizeSave(local);
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
        await storeLocalSave(resolved);
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
        await storeLocalSave(loaded);
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
    const persist = saveQueue.current.then(() => storeLocalSave(next));
    saveQueue.current = persist.catch(() => undefined);
    try {
      await persist;
      scheduleSync();
    } catch (error) {
      if (recordRef.current?.updatedAt === next.updatedAt) {
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
    modifierIds: readonly string[],
    checkpoint: BattleCheckpoint | null = null,
  ) {
    setBattle({
      seed: checkpoint?.seed ?? randomSeed(),
      modifierIds: checkpoint?.modifierIds ?? modifierIds,
      checkpoint,
      key: Date.now(),
    });
    setScreen("game");
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
        latest && latest.updatedAt !== local.updatedAt
          ? {
              ...latest,
              cloudOwnerId: profile.id,
              cloudRevision: saved.cloudRevision,
              pending: true,
            }
          : saved;
      recordRef.current = resolved;
      setRecord(resolved);
      await storeLocalSave(resolved);
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
      await storeLocalSave(accepted);
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
            onStart={(modifiers) => beginBattle(modifiers)}
            onResume={() => beginBattle([], record.data.checkpoint)}
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
              seed={battle.seed}
              modifierIds={battle.modifierIds}
              checkpoint={battle.checkpoint}
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
              onRetry={() => beginBattle(battle.modifierIds)}
              onAbandon={async () => {
                await commit(withoutBattleCheckpoint(recordRef.current!.data));
                setScreen("campaign");
                setBattle(null);
              }}
              onSettings={updateSettings}
            />
          </Suspense>
        )}

        {needRefresh && (
          <div className="update-banner">
            <span>A less dubious build has arrived.</span>
            <button
              className="button button-small button-primary"
              onClick={() => void updateServiceWorker(true)}
            >
              Update
            </button>
          </div>
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
