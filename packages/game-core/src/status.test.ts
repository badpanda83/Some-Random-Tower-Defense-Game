import { describe, expect, it } from "vitest";

import {
  activeSlowPercent,
  applyEnemyStatus,
  BOSS_SLOW_CAP_PERCENT,
  EMPTY_ENEMY_STATUS,
  HARD_CONTROL_RESOLVE_TICKS,
} from "./status.js";

describe("deterministic enemy statuses", () => {
  it("uses strongest slow, with later expiry winning equal magnitudes", () => {
    const first = applyEnemyStatus(
      EMPTY_ENEMY_STATUS,
      { kind: "slow", percent: 20, ticks: 40 },
      { boss: false, slowImmune: false },
      10,
    ).status;
    const weaker = applyEnemyStatus(
      first,
      { kind: "slow", percent: 10, ticks: 100 },
      { boss: false, slowImmune: false },
      11,
    ).status;
    const equal = applyEnemyStatus(
      weaker,
      { kind: "slow", percent: 20, ticks: 80 },
      { boss: false, slowImmune: false },
      12,
    ).status;

    expect(equal.slow).toEqual({ percent: 20, untilTick: 92 });
    expect(activeSlowPercent(equal, 13)).toBe(20);
  });

  it("caps boss slow and rejects slow-immune targets", () => {
    const boss = applyEnemyStatus(
      EMPTY_ENEMY_STATUS,
      { kind: "slow", percent: 60, ticks: 20 },
      { boss: true, slowImmune: false },
      0,
    );
    const immune = applyEnemyStatus(
      EMPTY_ENEMY_STATUS,
      { kind: "slow", percent: 20, ticks: 20 },
      { boss: false, slowImmune: true },
      0,
    );
    expect(boss.status.slow?.percent).toBe(BOSS_SLOW_CAP_PERCENT);
    expect(immune.outcome).toBe("immune");
  });

  it("caps freeze and enforces post-control resolve without transforming enemy data", () => {
    const frozen = applyEnemyStatus(
      EMPTY_ENEMY_STATUS,
      { kind: "freeze", ticks: 200 },
      { boss: false, slowImmune: false },
      50,
    );
    expect(frozen.status.hardControl?.untilTick).toBe(70);
    expect(frozen.status.resolveUntilTick).toBe(
      70 + HARD_CONTROL_RESOLVE_TICKS,
    );
    const rejected = applyEnemyStatus(
      frozen.status,
      { kind: "polymorph", ticks: 60, slowPercent: 60 },
      { boss: false, slowImmune: false },
      71,
    );
    expect(rejected.outcome).toBe("rejected");
  });

  it("rejects hard control on bosses so callers can apply authored conversion", () => {
    const result = applyEnemyStatus(
      EMPTY_ENEMY_STATUS,
      { kind: "polymorph", ticks: 60, slowPercent: 60 },
      { boss: true, slowImmune: false },
      0,
    );
    expect(result.outcome).toBe("rejected");
    expect(result.status).toEqual(EMPTY_ENEMY_STATUS);
  });
});
