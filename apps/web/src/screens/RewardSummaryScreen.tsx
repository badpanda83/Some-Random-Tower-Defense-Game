import {
  CHEST_DEFINITIONS,
  equipmentDefinitions,
  equipmentEffectCopy,
  type MissionRewardLine,
} from "@srtg/game-core";
import type { BattleResult, SaveData } from "@srtg/protocol";

import { HubNavigation, type HubTab } from "../components/HubNavigation.js";

interface RewardSummaryScreenProps {
  readonly save: SaveData;
  readonly result: BattleResult;
  readonly lines: readonly MissionRewardLine[];
  readonly syncStatus: string;
  readonly onHome: () => void;
  readonly onNavigate: (tab: HubTab) => void;
}

export function RewardSummaryScreen({
  save,
  result,
  lines,
  syncStatus,
  onHome,
  onNavigate,
}: RewardSummaryScreenProps) {
  const crowns = lines.reduce((total, line) => total + line.questCrowns, 0);
  const dust = lines.reduce((total, line) => total + line.craftingDust, 0);
  const contributions = Object.entries(result.equipmentMetrics ?? {})
    .map(([itemId, metrics]) => ({
      item: equipmentDefinitions[itemId as keyof typeof equipmentDefinitions],
      value:
        metrics.directBonusDamage +
        metrics.echoDamage +
        metrics.controlTicksApplied +
        metrics.goldSaved +
        metrics.lifeDamagePrevented +
        metrics.teamBuffUptimeTicks,
      metrics,
    }))
    .filter((entry) => entry.item && entry.value > 0)
    .sort((left, right) => right.value - left.value)
    .slice(0, 2);
  const firstChestReady =
    !save.guidance.firstChestOpened &&
    save.economy.questCrowns >= CHEST_DEFINITIONS["royal-supply"].price;

  return (
    <main className="campaign-screen progression-screen">
      <HubNavigation
        active="campaign"
        save={save}
        syncStatus={syncStatus}
        onHome={onHome}
        onNavigate={onNavigate}
      />
      <section className="reward-summary card" aria-labelledby="reward-title">
        <span className="eyebrow">Victory recorded safely</span>
        <h1 id="reward-title">Quest Crowns earned</h1>
        <p>
          Every line below was saved with this mission result. Re-sending the
          result shows this same receipt and pays nothing twice.
        </p>
        <div className="reward-lines">
          {lines.map((line, index) => (
            <div key={`${line.kind}-${index}`}>
              <span>
                <strong>{line.label}</strong>
                {line.kind === "boss-bounty" && (
                  <small>The boss bounty is one-time.</small>
                )}
              </span>
              <span>
                {line.questCrowns > 0 && `+${line.questCrowns} Crowns`}
                {line.craftingDust > 0 && ` +${line.craftingDust} Dust`}
              </span>
            </div>
          ))}
          {lines.length === 0 && <p>No reward lines were added.</p>}
        </div>
        <div className="reward-totals">
          <span>
            <small>This victory</small>
            <strong>+{crowns} Crowns</strong>
          </span>
          <span>
            <small>This victory</small>
            <strong>+{dust} Dust</strong>
          </span>
          <span>
            <small>Updated balance</small>
            <strong>{save.economy.questCrowns} Crowns</strong>
          </span>
          <span>
            <small>Updated balance</small>
            <strong>{save.economy.craftingDust} Dust</strong>
          </span>
        </div>
        <div className="chest-meter">
          <div>
            <strong>Next Supply Chest</strong>
            <span>{Math.min(save.economy.questCrowns, 120)}/120 Crowns</span>
          </div>
          <progress
            value={Math.min(save.economy.questCrowns, 120)}
            max={120}
            aria-label="Progress toward a Supply Chest"
          />
        </div>
        {contributions.length > 0 && (
          <section className="equipment-contributions">
            <h2>Gear that helped</h2>
            {contributions.map(({ item, metrics }) => (
              <article key={item!.id}>
                <strong>{item!.name}</strong>
                <span>{equipmentEffectCopy(item!)}</span>
                <small>
                  {metrics.procCount} procs ·{" "}
                  {metrics.directBonusDamage + metrics.echoDamage} bonus damage
                  · {metrics.controlTicksApplied} control ticks
                </small>
              </article>
            ))}
          </section>
        )}
        <div className="result-actions">
          {firstChestReady ? (
            <button
              className="button button-primary"
              onClick={() => onNavigate("chests")}
            >
              Open your first chest
            </button>
          ) : (
            <button
              className="button button-primary"
              onClick={() => onNavigate("campaign")}
            >
              Continue to campaign
            </button>
          )}
          <button
            className="button button-ghost"
            onClick={() => onNavigate("defenders")}
          >
            Inspect defenders
          </button>
        </div>
      </section>
    </main>
  );
}
