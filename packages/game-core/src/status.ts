import { TICK_RATE } from "./types.js";

export const NORMAL_SLOW_CAP_PERCENT = 60;
export const BOSS_SLOW_CAP_PERCENT = 20;
export const FREEZE_CAP_TICKS = TICK_RATE;
export const HARD_CONTROL_RESOLVE_TICKS = TICK_RATE * 3;

export interface TimedSlow {
  readonly percent: number;
  readonly untilTick: number;
}

export interface HardControl {
  readonly kind: "freeze" | "polymorph";
  readonly untilTick: number;
  readonly slowPercent: number;
}

export interface EnemyStatusState {
  readonly slow: TimedSlow | null;
  readonly hardControl: HardControl | null;
  readonly resolveUntilTick: number;
  readonly markUntilTick: number;
  readonly markDamagePercent: number;
  readonly markDamageTypes: readonly ("physical" | "arcane" | "sonic")[] | null;
  readonly markSourceInstanceId: string | null;
  readonly markSourceMode: "only" | "exclude" | null;
}

export const EMPTY_ENEMY_STATUS: EnemyStatusState = {
  slow: null,
  hardControl: null,
  resolveUntilTick: 0,
  markUntilTick: 0,
  markDamagePercent: 0,
  markDamageTypes: null,
  markSourceInstanceId: null,
  markSourceMode: null,
};

export type StatusRequest =
  | {
      readonly kind: "slow";
      readonly percent: number;
      readonly ticks: number;
    }
  | { readonly kind: "freeze"; readonly ticks: number }
  | {
      readonly kind: "polymorph";
      readonly ticks: number;
      readonly slowPercent: number;
    }
  | {
      readonly kind: "mark";
      readonly ticks: number;
      readonly damagePercent: number;
      readonly damageTypes?: readonly ("physical" | "arcane" | "sonic")[];
      readonly sourceInstanceId?: string;
      readonly sourceMode?: "only" | "exclude";
    };

export interface StatusTarget {
  readonly boss: boolean;
  readonly slowImmune: boolean;
}

export interface StatusApplication {
  readonly status: EnemyStatusState;
  readonly outcome: "applied" | "immune" | "rejected";
  readonly appliedTicks: number;
}

export function expireEnemyStatus(
  status: EnemyStatusState,
  tick: number,
): EnemyStatusState {
  const hardControl =
    status.hardControl && status.hardControl.untilTick > tick
      ? status.hardControl
      : null;
  const resolveUntilTick =
    status.hardControl &&
    status.hardControl.untilTick <= tick &&
    status.resolveUntilTick <
      status.hardControl.untilTick + HARD_CONTROL_RESOLVE_TICKS
      ? status.hardControl.untilTick + HARD_CONTROL_RESOLVE_TICKS
      : status.resolveUntilTick;
  return {
    slow: status.slow && status.slow.untilTick > tick ? status.slow : null,
    hardControl,
    resolveUntilTick,
    markUntilTick: status.markUntilTick > tick ? status.markUntilTick : 0,
    markDamagePercent:
      status.markUntilTick > tick ? status.markDamagePercent : 0,
    markDamageTypes:
      status.markUntilTick > tick ? status.markDamageTypes : null,
    markSourceInstanceId:
      status.markUntilTick > tick ? status.markSourceInstanceId : null,
    markSourceMode: status.markUntilTick > tick ? status.markSourceMode : null,
  };
}

export function applyEnemyStatus(
  current: EnemyStatusState,
  request: StatusRequest,
  target: StatusTarget,
  tick: number,
): StatusApplication {
  const status = expireEnemyStatus(current, tick);
  if (request.kind === "mark") {
    return {
      status: {
        ...status,
        markUntilTick: Math.max(status.markUntilTick, tick + request.ticks),
        markDamagePercent: Math.max(
          status.markDamagePercent,
          request.damagePercent,
        ),
        markDamageTypes: request.damageTypes ?? null,
        markSourceInstanceId: request.sourceInstanceId ?? null,
        markSourceMode: request.sourceMode ?? null,
      },
      outcome: "applied",
      appliedTicks: request.ticks,
    };
  }
  if (target.slowImmune) {
    return { status, outcome: "immune", appliedTicks: 0 };
  }
  if (request.kind === "slow") {
    const percent = Math.min(
      target.boss ? BOSS_SLOW_CAP_PERCENT : NORMAL_SLOW_CAP_PERCENT,
      Math.max(0, request.percent),
    );
    const candidate = { percent, untilTick: tick + request.ticks };
    const slow =
      !status.slow ||
      candidate.percent > status.slow.percent ||
      (candidate.percent === status.slow.percent &&
        candidate.untilTick > status.slow.untilTick)
        ? candidate
        : status.slow;
    return {
      status: { ...status, slow },
      outcome: "applied",
      appliedTicks: slow === candidate ? request.ticks : 0,
    };
  }
  if (target.boss || status.hardControl || status.resolveUntilTick > tick) {
    return { status, outcome: "rejected", appliedTicks: 0 };
  }
  const ticks =
    request.kind === "freeze"
      ? Math.min(request.ticks, FREEZE_CAP_TICKS)
      : request.ticks;
  return {
    status: {
      ...status,
      hardControl: {
        kind: request.kind,
        untilTick: tick + ticks,
        slowPercent: request.kind === "freeze" ? 100 : request.slowPercent,
      },
      resolveUntilTick: tick + ticks + HARD_CONTROL_RESOLVE_TICKS,
    },
    outcome: "applied",
    appliedTicks: ticks,
  };
}

export function activeSlowPercent(
  status: EnemyStatusState,
  tick: number,
): number {
  const current = expireEnemyStatus(status, tick);
  return Math.max(
    current.slow?.percent ?? 0,
    current.hardControl?.slowPercent ?? 0,
  );
}
