import {
  EMPTY_LOADOUTS,
  type DefenderId,
  type EquipmentRarity,
  type EquipmentSlot,
  type LoadoutSnapshot,
} from "@srtg/protocol";

import { TICK_RATE } from "./types.js";

export const EQUIPMENT_SLOT_ORDER = ["weapon", "armor", "charm"] as const;
export const FULL_LOADOUT_OUTPUT_CAP_PERCENT = 15;
export const DAMAGE_PROC_DPS_CAP_PERCENT = 5;
export const RANDOM_CONTROL_MIN_COOLDOWN_TICKS = TICK_RATE * 6;
export const MINIMUM_COOLDOWN_PERCENT = 70;
export const SUPPORT_COOLDOWN_CAP_PERCENT = 30;

export type EquipmentCondition =
  | { readonly kind: "route-progress"; readonly minimumPercent: number }
  | { readonly kind: "boss-route-progress"; readonly minimumPercent: number }
  | { readonly kind: "armor"; readonly minimum: number }
  | { readonly kind: "wave-time"; readonly maximumTicks: number }
  | { readonly kind: "roster"; readonly otherDefenderTypes: number }
  | { readonly kind: "after-leak" };

export type EquipmentEffect =
  | {
      readonly kind: "stat";
      readonly id: string;
      readonly stat:
        "damage" | "cooldown" | "range" | "splash" | "armor-ignore";
      readonly percent: number;
      readonly condition?: EquipmentCondition;
    }
  | {
      readonly kind: "placement-discount";
      readonly id: string;
      readonly amount: number;
      readonly firstOnly: boolean;
    }
  | {
      readonly kind: "secondary-target";
      readonly id: string;
      readonly damagePercentRanksOneToThree: number;
      readonly damagePercentRankFour: number;
      readonly canProc: false;
    }
  | {
      readonly kind: "prevent-leak-damage";
      readonly id: string;
      readonly amount: number;
      readonly nonBossOnly: true;
      readonly oncePerBattle: true;
    }
  | {
      readonly kind: "attack-counter";
      readonly id: string;
      readonly every: number;
      readonly resets: "wave" | "battle";
      readonly action:
        | {
            readonly kind: "cooldown-percent";
            readonly percent: number;
          }
        | {
            readonly kind: "echo";
            readonly damagePercent: number;
            readonly canProc: false;
            readonly target: "primary" | "nearest-secondary";
          }
        | {
            readonly kind: "push-or-boss-mark";
            readonly pushRoutePercent: number;
            readonly perTargetWaveCapPercent: number;
            readonly markTicks: number;
            readonly alliedDamagePercent: number;
          }
        | {
            readonly kind: "team-haste";
            readonly ticks: number;
            readonly cooldownTicks: number;
            readonly cooldownPercent: number;
            readonly rangePercent: number;
          };
    }
  | {
      readonly kind: "primary-proc";
      readonly id: string;
      readonly chanceBasisPoints: number;
      readonly cooldownTicks: number;
      readonly normal:
        | {
            readonly kind: "freeze";
            readonly ticks: number;
          }
        | {
            readonly kind: "polymorph";
            readonly ticks: number;
            readonly slowPercent: number;
          };
      readonly boss:
        | {
            readonly kind: "slow";
            readonly ticks: number;
            readonly slowPercent: number;
          }
        | {
            readonly kind: "bonus-damage";
            readonly percent: number;
          };
    }
  | {
      readonly kind: "secondary-slow";
      readonly id: string;
      readonly slowPercent: number;
      readonly ticks: number;
      readonly normalOnly: true;
    }
  | {
      readonly kind: "leak-haste";
      readonly id: string;
      readonly cooldownPercent: number;
      readonly ticks: number;
      readonly oncePerWave: true;
    }
  | {
      readonly kind: "support-bonus";
      readonly id: string;
      readonly percentagePoints: number;
      readonly capPercent: number;
    }
  | {
      readonly kind: "route-mark";
      readonly id: string;
      readonly minimumProgressPercent: number;
      readonly normalSlowPercent: number;
      readonly normalTicks: number;
      readonly normalDamagePercent: number;
      readonly bossSlowPercent: number;
      readonly bossTicks: number;
      readonly oncePerBattle: true;
    };

export interface EquipmentDefinition {
  readonly id: string;
  readonly name: string;
  readonly flavor: string;
  readonly phase: "mvp" | "expansion";
  readonly rarity: EquipmentRarity;
  readonly slot: EquipmentSlot;
  readonly defenderId: DefenderId | null;
  readonly horizontalBudgetPercent: number;
  readonly effects: readonly EquipmentEffect[];
}

export const equipmentDefinitions = {
  "butter-knife-of-bravery": {
    id: "butter-knife-of-bravery",
    name: "Butter Knife of Bravery",
    flavor: "Technically sharper than courage.",
    phase: "mvp",
    rarity: "C",
    slot: "weapon",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 2,
    effects: [
      { kind: "stat", id: "bravery-speed", stat: "cooldown", percent: -6 },
      { kind: "stat", id: "bravery-damage", stat: "damage", percent: -4 },
    ],
  },
  "colander-cuirass": {
    id: "colander-cuirass",
    name: "Colander Cuirass",
    flavor: "Lets fear drain while retaining most peas.",
    phase: "expansion",
    rarity: "B",
    slot: "armor",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 1,
    effects: [
      {
        kind: "placement-discount",
        id: "colander-discount",
        amount: 8,
        firstOnly: true,
      },
    ],
  },
  "emergency-pea": {
    id: "emergency-pea",
    name: "Emergency Pea",
    flavor: "Break glass only if vegetables become tactical.",
    phase: "mvp",
    rarity: "A",
    slot: "charm",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "stat",
        id: "pea-late-damage",
        stat: "damage",
        percent: 12,
        condition: { kind: "route-progress", minimumPercent: 70 },
      },
      {
        kind: "stat",
        id: "pea-boss-damage",
        stat: "damage",
        percent: 6,
        condition: { kind: "boss-route-progress", minimumPercent: 70 },
      },
    ],
  },
  "fork-of-many-tines": {
    id: "fork-of-many-tines",
    name: "Fork of Many Tines",
    flavor: "Now with an irresponsible number of pointy opinions.",
    phase: "mvp",
    rarity: "S",
    slot: "weapon",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "secondary-target",
        id: "many-tines-secondary",
        damagePercentRanksOneToThree: 60,
        damagePercentRankFour: 35,
        canProc: false,
      },
    ],
  },
  "oven-mitts-of-holding": {
    id: "oven-mitts-of-holding",
    name: "Oven Mitts of Holding",
    flavor: "Hot gates hate this one weird glove.",
    phase: "expansion",
    rarity: "S+",
    slot: "armor",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 3,
    effects: [
      {
        kind: "prevent-leak-damage",
        id: "mitts-first-leak",
        amount: 1,
        nonBossOnly: true,
        oncePerBattle: true,
      },
    ],
  },
  "sir-plus-ones-rsvp": {
    id: "sir-plus-ones-rsvp",
    name: "Sir Plus-One's RSVP",
    flavor: "Admits one knight and two increasingly questionable friends.",
    phase: "expansion",
    rarity: "S++",
    slot: "charm",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 7,
    effects: [
      {
        kind: "stat",
        id: "rsvp-damage",
        stat: "damage",
        percent: 8,
        condition: { kind: "roster", otherDefenderTypes: 2 },
      },
      {
        kind: "stat",
        id: "rsvp-range",
        stat: "range",
        percent: 8,
        condition: { kind: "roster", otherDefenderTypes: 2 },
      },
    ],
  },
  excalifork: {
    id: "excalifork",
    name: "Excalifork",
    flavor: "Chosen by the stone after every sword called in sick.",
    phase: "mvp",
    rarity: "S+++",
    slot: "weapon",
    defenderId: "fork-knight",
    horizontalBudgetPercent: 8,
    effects: [
      {
        kind: "attack-counter",
        id: "excalifork-seventh-hit",
        every: 7,
        resets: "battle",
        action: {
          kind: "push-or-boss-mark",
          pushRoutePercent: 6,
          perTargetWaveCapPercent: 12,
          markTicks: TICK_RATE * 3,
          alliedDamagePercent: 10,
        },
      },
    ],
  },
  "apprentice-bathrobe": {
    id: "apprentice-bathrobe",
    name: "Apprentice Bathrobe",
    flavor: "One size fits most magical emergencies.",
    phase: "mvp",
    rarity: "C",
    slot: "armor",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 2,
    effects: [
      { kind: "stat", id: "bathrobe-range", stat: "range", percent: 7 },
      { kind: "stat", id: "bathrobe-speed", stat: "cooldown", percent: 5 },
    ],
  },
  "coupon-familiar": {
    id: "coupon-familiar",
    name: "Coupon Familiar",
    flavor: "Valid at participating wizards. No wizard participates.",
    phase: "expansion",
    rarity: "B",
    slot: "charm",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 1,
    effects: [
      {
        kind: "placement-discount",
        id: "familiar-discount",
        amount: 7,
        firstOnly: true,
      },
    ],
  },
  "wand-of-mild-inconvenience": {
    id: "wand-of-mild-inconvenience",
    name: "Wand of Mild Inconvenience",
    flavor: "Turns major peril into a strongly worded nuisance.",
    phase: "mvp",
    rarity: "A",
    slot: "weapon",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 5,
    effects: [
      { kind: "stat", id: "mild-splash", stat: "splash", percent: 18 },
      { kind: "stat", id: "mild-damage", stat: "damage", percent: -5 },
    ],
  },
  "spellcheck-amulet": {
    id: "spellcheck-amulet",
    name: "Spellcheck Amulet",
    flavor: "Corrects armour to surprisingly flammable.",
    phase: "expansion",
    rarity: "S",
    slot: "charm",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "stat",
        id: "spellcheck-armor",
        stat: "armor-ignore",
        percent: 35,
        condition: { kind: "armor", minimum: 4 },
      },
    ],
  },
  "wand-of-definitely-winter": {
    id: "wand-of-definitely-winter",
    name: "Wand of Definitely Winter",
    flavor: "Cold enough to make soup reconsider its career.",
    phase: "mvp",
    rarity: "S+",
    slot: "weapon",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 6,
    effects: [
      {
        kind: "primary-proc",
        id: "definitely-winter-freeze",
        chanceBasisPoints: 1200,
        cooldownTicks: TICK_RATE * 6,
        normal: { kind: "freeze", ticks: TICK_RATE },
        boss: { kind: "slow", ticks: TICK_RATE, slowPercent: 20 },
      },
    ],
  },
  "robes-of-the-second-draft": {
    id: "robes-of-the-second-draft",
    name: "Robes of the Second Draft",
    flavor: "Every spell deserves an unnecessary revision.",
    phase: "expansion",
    rarity: "S++",
    slot: "armor",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 7,
    effects: [
      {
        kind: "attack-counter",
        id: "second-draft-repeat",
        every: 4,
        resets: "battle",
        action: {
          kind: "echo",
          damagePercent: 40,
          canProc: false,
          target: "primary",
        },
      },
    ],
  },
  "wand-of-ooze-and-aahs": {
    id: "wand-of-ooze-and-aahs",
    name: "Wand of Ooze and Aahs",
    flavor: "A prestigious wand, according to three slimes in a hat.",
    phase: "mvp",
    rarity: "S+++",
    slot: "weapon",
    defenderId: "discount-wizard",
    horizontalBudgetPercent: 8,
    effects: [
      {
        kind: "primary-proc",
        id: "ooze-polymorph",
        chanceBasisPoints: 800,
        cooldownTicks: TICK_RATE * 8,
        normal: {
          kind: "polymorph",
          ticks: TICK_RATE * 3,
          slowPercent: 60,
        },
        boss: { kind: "bonus-damage", percent: 25 },
      },
    ],
  },
  "lute-with-one-good-string": {
    id: "lute-with-one-good-string",
    name: "Lute with One Good String",
    flavor: "The other strings provide emotional support.",
    phase: "mvp",
    rarity: "C",
    slot: "weapon",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 3,
    effects: [
      { kind: "stat", id: "good-string-damage", stat: "damage", percent: 8 },
      { kind: "stat", id: "good-string-splash", stat: "splash", percent: -10 },
    ],
  },
  "studded-leather-sheet-music": {
    id: "studded-leather-sheet-music",
    name: "Studded Leather Sheet Music",
    flavor: "Protects against arrows and difficult key changes.",
    phase: "expansion",
    rarity: "B",
    slot: "armor",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 3,
    effects: [
      { kind: "stat", id: "sheet-music-range", stat: "range", percent: 6 },
    ],
  },
  "metronome-of-questionable-tempo": {
    id: "metronome-of-questionable-tempo",
    name: "Metronome of Questionable Tempo",
    flavor: "Tick, tick, probably tock.",
    phase: "mvp",
    rarity: "A",
    slot: "charm",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "attack-counter",
        id: "metronome-fourth",
        every: 4,
        resets: "wave",
        action: { kind: "cooldown-percent", percent: -20 },
      },
    ],
  },
  "axe-of-acapella": {
    id: "axe-of-acapella",
    name: "Axe of Acapella",
    flavor: "No backing track. Several backing bruises.",
    phase: "expansion",
    rarity: "S",
    slot: "weapon",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "attack-counter",
        id: "acapella-fifth",
        every: 5,
        resets: "battle",
        action: {
          kind: "echo",
          damagePercent: 50,
          canProc: false,
          target: "nearest-secondary",
        },
      },
    ],
  },
  "backup-dancer-in-a-jar": {
    id: "backup-dancer-in-a-jar",
    name: "Backup Dancer in a Jar",
    flavor: "Shake gently. Applause may occur.",
    phase: "mvp",
    rarity: "S+",
    slot: "charm",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 6,
    effects: [
      {
        kind: "secondary-slow",
        id: "backup-dancer-slow",
        slowPercent: 20,
        ticks: TICK_RATE,
        normalOnly: true,
      },
    ],
  },
  "tour-jacket-of-shared-haste": {
    id: "tour-jacket-of-shared-haste",
    name: "Tour Jacket of Shared Haste",
    flavor: "Still smells faintly of sold-out taverns.",
    phase: "expansion",
    rarity: "S++",
    slot: "armor",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 7,
    effects: [
      {
        kind: "support-bonus",
        id: "tour-jacket-support",
        percentagePoints: 8,
        capPercent: SUPPORT_COOLDOWN_CAP_PERCENT,
      },
    ],
  },
  "the-forbidden-power-chord": {
    id: "the-forbidden-power-chord",
    name: "The Forbidden Power Chord",
    flavor: "Banned in six taverns and one structurally nervous bridge.",
    phase: "mvp",
    rarity: "S+++",
    slot: "charm",
    defenderId: "bardbarian",
    horizontalBudgetPercent: 8,
    effects: [
      {
        kind: "attack-counter",
        id: "forbidden-chorus",
        every: 10,
        resets: "battle",
        action: {
          kind: "team-haste",
          ticks: TICK_RATE * 2,
          cooldownTicks: TICK_RATE * 10,
          cooldownPercent: -10,
          rangePercent: 10,
        },
      },
    ],
  },
  "cardboard-cuirass-deluxe-ish": {
    id: "cardboard-cuirass-deluxe-ish",
    name: "Cardboard Cuirass, Deluxe-ish",
    flavor: "Now 12% less immediately soggy.",
    phase: "mvp",
    rarity: "C",
    slot: "armor",
    defenderId: null,
    horizontalBudgetPercent: 1,
    effects: [
      {
        kind: "placement-discount",
        id: "cardboard-discount",
        amount: 4,
        firstOnly: true,
      },
    ],
  },
  "map-that-says-here-ish": {
    id: "map-that-says-here-ish",
    name: "Map That Says 'Here-ish'",
    flavor: "Accuracy sold separately.",
    phase: "mvp",
    rarity: "B",
    slot: "charm",
    defenderId: null,
    horizontalBudgetPercent: 3,
    effects: [
      { kind: "stat", id: "map-range", stat: "range", percent: 7 },
      { kind: "stat", id: "map-damage", stat: "damage", percent: -4 },
    ],
  },
  "boots-of-sensible-standing": {
    id: "boots-of-sensible-standing",
    name: "Boots of Sensible Standing",
    flavor: "For heroes who refuse to stand somewhere silly.",
    phase: "mvp",
    rarity: "A",
    slot: "armor",
    defenderId: null,
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "stat",
        id: "boots-opening-range",
        stat: "range",
        percent: 15,
        condition: { kind: "wave-time", maximumTicks: TICK_RATE * 5 },
      },
    ],
  },
  "pocket-hourglass-mostly-sand": {
    id: "pocket-hourglass-mostly-sand",
    name: "Pocket Hourglass (Mostly Sand)",
    flavor: "Contains time, sand, and one suspicious breadcrumb.",
    phase: "mvp",
    rarity: "S",
    slot: "charm",
    defenderId: null,
    horizontalBudgetPercent: 5,
    effects: [
      {
        kind: "stat",
        id: "hourglass-opening-speed",
        stat: "cooldown",
        percent: -10,
        condition: { kind: "wave-time", maximumTicks: TICK_RATE * 8 },
      },
    ],
  },
  "cape-of-the-second-chance": {
    id: "cape-of-the-second-chance",
    name: "Cape of the Second Chance",
    flavor: "Does not prevent mistakes. Judges them productively.",
    phase: "mvp",
    rarity: "S+",
    slot: "armor",
    defenderId: null,
    horizontalBudgetPercent: 6,
    effects: [
      {
        kind: "leak-haste",
        id: "second-chance-haste",
        cooldownPercent: -20,
        ticks: TICK_RATE * 5,
        oncePerWave: true,
      },
    ],
  },
  "royal-participation-trophy": {
    id: "royal-participation-trophy",
    name: "Royal Participation Trophy",
    flavor: "Awarded for arriving with at least two coworkers.",
    phase: "mvp",
    rarity: "S++",
    slot: "charm",
    defenderId: null,
    horizontalBudgetPercent: 7,
    effects: [
      {
        kind: "stat",
        id: "trophy-one-damage",
        stat: "damage",
        percent: 5,
        condition: { kind: "roster", otherDefenderTypes: 1 },
      },
      {
        kind: "stat",
        id: "trophy-two-damage",
        stat: "damage",
        percent: 5,
        condition: { kind: "roster", otherDefenderTypes: 2 },
      },
      {
        kind: "stat",
        id: "trophy-one-range",
        stat: "range",
        percent: 5,
        condition: { kind: "roster", otherDefenderTypes: 1 },
      },
      {
        kind: "stat",
        id: "trophy-two-range",
        stat: "range",
        percent: 5,
        condition: { kind: "roster", otherDefenderTypes: 2 },
      },
    ],
  },
  "plot-armor-pin": {
    id: "plot-armor-pin",
    name: "Plot Armor Pin",
    flavor: "The story needs you. Terms and conditions need the enemy.",
    phase: "mvp",
    rarity: "S+++",
    slot: "charm",
    defenderId: null,
    horizontalBudgetPercent: 8,
    effects: [
      {
        kind: "route-mark",
        id: "plot-armor-late-mark",
        minimumProgressPercent: 80,
        normalSlowPercent: 50,
        normalTicks: TICK_RATE * 2,
        normalDamagePercent: 25,
        bossSlowPercent: 15,
        bossTicks: TICK_RATE,
        oncePerBattle: true,
      },
    ],
  },
} as const satisfies Record<string, EquipmentDefinition>;

export type EquipmentId = keyof typeof equipmentDefinitions;

export function createEmptyLoadouts(): LoadoutSnapshot {
  return structuredClone(EMPTY_LOADOUTS);
}

export function equipmentForDefender(
  loadouts: LoadoutSnapshot,
  defenderId: DefenderId,
): readonly EquipmentDefinition[] {
  return EQUIPMENT_SLOT_ORDER.flatMap((slot) => {
    const itemId = loadouts[defenderId][slot];
    if (!itemId) {
      return [];
    }
    const definition =
      equipmentDefinitions[itemId as keyof typeof equipmentDefinitions];
    return definition ? [definition] : [];
  });
}

export function validateLoadoutSnapshot(
  loadouts: LoadoutSnapshot,
): readonly string[] {
  const errors: string[] = [];
  const universalOwners = new Map<string, DefenderId>();
  for (const defenderId of Object.keys(loadouts) as DefenderId[]) {
    for (const slot of EQUIPMENT_SLOT_ORDER) {
      const itemId = loadouts[defenderId][slot];
      if (!itemId) {
        continue;
      }
      const item =
        equipmentDefinitions[itemId as keyof typeof equipmentDefinitions];
      if (!item) {
        errors.push(`Unknown equipment item: ${itemId}`);
        continue;
      }
      if (item.slot !== slot) {
        errors.push(`Equipment ${itemId} cannot occupy ${slot}`);
      }
      if (item.defenderId && item.defenderId !== defenderId) {
        errors.push(`Equipment ${itemId} cannot be used by ${defenderId}`);
      }
      if (!item.defenderId) {
        const owner = universalOwners.get(itemId);
        if (owner && owner !== defenderId) {
          errors.push(`Universal equipment ${itemId} is equipped twice`);
        }
        universalOwners.set(itemId, defenderId);
      }
    }
  }
  return errors;
}

export interface EquipmentStatContext {
  readonly routeProgressPercent?: number;
  readonly boss?: boolean;
  readonly armor?: number;
  readonly waveElapsedTicks: number;
  readonly deployedDefenderIds: ReadonlySet<DefenderId>;
  readonly afterLeak?: boolean;
}

export interface EquipmentStats {
  readonly damage: number;
  readonly cooldownTicks: number;
  readonly range: number;
  readonly splashRadius: number;
  readonly armorIgnorePercent: number;
}

function conditionMatches(
  condition: EquipmentCondition | undefined,
  defenderId: DefenderId,
  context: EquipmentStatContext,
): boolean {
  if (!condition) {
    return true;
  }
  switch (condition.kind) {
    case "route-progress":
      return (
        !context.boss &&
        (context.routeProgressPercent ?? 0) >= condition.minimumPercent
      );
    case "boss-route-progress":
      return (
        context.boss === true &&
        (context.routeProgressPercent ?? 0) >= condition.minimumPercent
      );
    case "armor":
      return (context.armor ?? 0) >= condition.minimum;
    case "wave-time":
      return context.waveElapsedTicks < condition.maximumTicks;
    case "roster":
      return (
        [...context.deployedDefenderIds].filter((id) => id !== defenderId)
          .length >= condition.otherDefenderTypes
      );
    case "after-leak":
      return context.afterLeak === true;
  }
}

export function applyEquipmentStats(
  base: EquipmentStats,
  defenderId: DefenderId,
  loadouts: LoadoutSnapshot,
  context: EquipmentStatContext,
): EquipmentStats {
  const additive = {
    damage: 0,
    cooldown: 0,
    range: 0,
    splash: 0,
    armorIgnore: 0,
  };
  const conditional = { ...additive };
  for (const item of equipmentForDefender(loadouts, defenderId)) {
    for (const effect of item.effects) {
      if (
        effect.kind !== "stat" ||
        !conditionMatches(effect.condition, defenderId, context)
      ) {
        continue;
      }
      const percentages = effect.condition ? conditional : additive;
      switch (effect.stat) {
        case "damage":
          percentages.damage += effect.percent;
          break;
        case "cooldown":
          percentages.cooldown += effect.percent;
          break;
        case "range":
          percentages.range += effect.percent;
          break;
        case "splash":
          percentages.splash += effect.percent;
          break;
        case "armor-ignore":
          percentages.armorIgnore += effect.percent;
          break;
      }
    }
  }
  const minimumCooldown = Math.ceil(
    (base.cooldownTicks * MINIMUM_COOLDOWN_PERCENT) / 100,
  );
  const modified = (
    value: number,
    additivePercent: number,
    conditionalPercent: number,
  ) =>
    Math.round(
      value *
        ((100 + additivePercent) / 100) *
        ((100 + conditionalPercent) / 100),
    );
  return {
    damage: Math.max(
      1,
      Math.min(
        Math.round(
          (base.damage * (100 + FULL_LOADOUT_OUTPUT_CAP_PERCENT)) / 100,
        ),
        modified(base.damage, additive.damage, conditional.damage),
      ),
    ),
    cooldownTicks: Math.max(
      minimumCooldown,
      modified(base.cooldownTicks, additive.cooldown, conditional.cooldown),
    ),
    range: Math.max(1, modified(base.range, additive.range, conditional.range)),
    splashRadius: Math.max(
      0,
      modified(base.splashRadius, additive.splash, conditional.splash),
    ),
    armorIgnorePercent: Math.min(
      100,
      Math.max(
        0,
        base.armorIgnorePercent +
          additive.armorIgnore +
          conditional.armorIgnore,
      ),
    ),
  };
}
