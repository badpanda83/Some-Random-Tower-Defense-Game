import type { SaveData } from "@srtg/protocol";

export type HubTab = "campaign" | "defenders" | "chests";

interface HubNavigationProps {
  readonly active: HubTab;
  readonly save: SaveData;
  readonly syncStatus: string;
  readonly installAvailable?: boolean;
  readonly onInstall?: () => void;
  readonly onHome: () => void;
  readonly onNavigate: (tab: HubTab) => void;
}

export function HubNavigation({
  active,
  save,
  syncStatus,
  installAvailable = false,
  onInstall,
  onHome,
  onNavigate,
}: HubNavigationProps) {
  const completedMissionIds = new Set(
    Object.entries(save.campaign.levels)
      .filter(([, progress]) => progress.victories > 0)
      .map(([levelId]) => levelId),
  );
  for (const result of save.campaign.recentResults) {
    if (result.result === "victory") {
      completedMissionIds.add(result.levelId);
    }
  }
  return (
    <header className="hub-header">
      <div className="topbar">
        <button className="brand-button" onClick={onHome}>
          <img src="/crest.svg" alt="" />
          <span>The Dubious Realm</span>
        </button>
        <div className="status-cluster">
          <span className="campaign-progress">
            <strong>{completedMissionIds.size}/10</strong> missions
          </span>
          <span className="wallet-pill" aria-label="Quest Crown balance">
            <small>Crowns</small>
            <strong>{save.economy.questCrowns}</strong>
          </span>
          <span className="wallet-pill" aria-label="Crafting Dust balance">
            <small>Dust</small>
            <strong>{save.economy.craftingDust}</strong>
          </span>
          <span className={`sync-pill sync-${syncStatus}`}>
            <span className="status-dot" />
            {syncStatus}
          </span>
          {installAvailable && onInstall && (
            <button
              className="button button-small button-ghost"
              onClick={onInstall}
            >
              Install
            </button>
          )}
        </div>
      </div>
      <nav className="hub-tabs" aria-label="Main game areas">
        {(["campaign", "defenders", "chests"] as const).map((tab) => (
          <button
            key={tab}
            className={active === tab ? "is-active" : ""}
            aria-current={active === tab ? "page" : undefined}
            onClick={() => onNavigate(tab)}
          >
            {tab[0]!.toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>
    </header>
  );
}
