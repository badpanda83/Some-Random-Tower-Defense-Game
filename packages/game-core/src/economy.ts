import {
  EQUIPMENT_RULES_VERSION,
  type BattleResult,
  type DefenderId,
  type EconomyReceipt,
  type EquipmentRarity,
  type EquipmentSlot,
  type SaveData,
} from "@srtg/protocol";

import {
  EQUIPMENT_SLOT_ORDER,
  equipmentDefinitions,
  type EquipmentDefinition,
  type EquipmentEffect,
  type EquipmentId,
} from "./equipment.js";
import { SeededRandom } from "./rng.js";

export const RARITY_ORDER = [
  "C",
  "B",
  "A",
  "S",
  "S+",
  "S++",
  "S+++",
] as const satisfies readonly EquipmentRarity[];

export const CHEST_DEFINITIONS = {
  "royal-supply": {
    id: "royal-supply",
    name: "Royal Supply Chest",
    shortName: "Supply Chest",
    price: 120,
    dust: 10,
    expectedReplayCopy:
      "Usually 4 varied replays, 6 alternating replays, or more than 12 same-map repeats.",
    odds: {
      C: 3500,
      B: 2700,
      A: 1900,
      S: 1100,
      "S+": 500,
      "S++": 250,
      "S+++": 50,
    },
  },
  "defender-trunk": {
    id: "defender-trunk",
    name: "Defender Trunk",
    shortName: "Focused Defender Chest",
    price: 180,
    dust: 15,
    expectedReplayCopy:
      "Usually 6 varied replays or 9 ordinary alternating replays.",
    odds: {
      C: 0,
      B: 3600,
      A: 3000,
      S: 1800,
      "S+": 1000,
      "S++": 500,
      "S+++": 100,
    },
  },
} as const;

export type ChestType = keyof typeof CHEST_DEFINITIONS;

export const DUPLICATE_DUST = {
  C: 20,
  B: 35,
  A: 60,
  S: 100,
  "S+": 170,
  "S++": 280,
  "S+++": 450,
} as const satisfies Record<EquipmentRarity, number>;

export const SALVAGE_DUST = {
  C: 10,
  B: 17,
  A: 30,
  S: 50,
  "S+": 85,
  "S++": 140,
  "S+++": 225,
} as const satisfies Record<EquipmentRarity, number>;

export const CRAFT_COST = {
  C: 80,
  B: 140,
  A: 240,
  S: 400,
  "S+": 680,
  "S++": 1120,
  "S+++": 1800,
} as const satisfies Record<EquipmentRarity, number>;

export const PITY_THRESHOLDS = {
  S: 5,
  "S+": 12,
  "S++": 30,
  "S+++": 60,
} as const;

export const DEFENDER_NAMES = {
  "fork-knight": "Fork Knight",
  "discount-wizard": "Discount Wizard",
  bardbarian: "Bardbarian",
} as const satisfies Record<DefenderId, string>;

export const MVP_EQUIPMENT = Object.values(equipmentDefinitions).filter(
  (item) => item.phase === "mvp",
);

const FIRST_CLEAR_CROWNS: Readonly<Record<string, number>> = {
  "muddy-moat": 120,
  "mimic-market": 90,
  "troll-tollway": 90,
  "castle-hassle": 120,
  "frozen-assets": 90,
  "department-of-unnecessary-bridges": 90,
  "siege-and-desist": 120,
  "lava-lamp-district": 90,
  "necromancers-networking-event": 90,
  "quarterly-dragon-review": 150,
};

const BOSS_BOUNTY_LEVELS = new Set([
  "mimic-market",
  "castle-hassle",
  "department-of-unnecessary-bridges",
  "siege-and-desist",
  "lava-lamp-district",
  "quarterly-dragon-review",
]);

const rarityRank = (rarity: EquipmentRarity) => RARITY_ORDER.indexOf(rarity);

function nextReceiptSequence(save: SaveData): number {
  return (
    Math.max(
      save.economy.openSequence,
      ...save.economy.recentReceipts.map(
        (receipt) => receipt.createdAtSequence,
      ),
      0,
    ) + 1
  );
}

function appendReceipt(
  save: SaveData,
  receipt: EconomyReceipt,
): EconomyReceipt[] {
  return [receipt, ...save.economy.recentReceipts].slice(0, 100);
}

function findReceipt(
  save: SaveData,
  requestId: string,
): EconomyReceipt | undefined {
  return save.economy.recentReceipts.find(
    (receipt) => receipt.requestId === requestId,
  );
}

const MAX_REWARD_CLAIM_IDS = 5000;
const MAX_ECONOMY_ACTION_CLAIMS = 4800;

function requireUnusedRequest(save: SaveData, requestId: string): void {
  if (!requestId || requestId.length > 240) {
    throw new Error("This action needs a valid request ID.");
  }
  if (
    findReceipt(save, requestId) ||
    save.economy.rewardClaimIds.includes(requestGuardId(requestId))
  ) {
    throw new Error("That request ID was already used for another action.");
  }
}

function requireFreshRequest(save: SaveData, requestId: string): void {
  requireUnusedRequest(save, requestId);
  if (save.economy.rewardClaimIds.length >= MAX_ECONOMY_ACTION_CLAIMS) {
    throw new Error(
      "This save reached its economy safety limit. Contact support before spending Crowns or changing items.",
    );
  }
}

function hashLootTransaction(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function requestGuardId(requestId: string): string {
  const left = hashLootTransaction(`left:${requestId}`).toString(36);
  const right = hashLootTransaction(`right:${requestId}`).toString(36);
  return `request:${left}${right}`;
}

function transactionRandom(
  lootSeed: string,
  openSequence: number,
  chestType: ChestType,
  focusDefender: DefenderId | null,
): SeededRandom {
  return new SeededRandom(
    hashLootTransaction(
      [
        lootSeed,
        EQUIPMENT_RULES_VERSION,
        openSequence,
        chestType,
        focusDefender ?? "all",
      ].join(":"),
    ),
  );
}

function rollBaseRarity(
  random: SeededRandom,
  chestType: ChestType,
): EquipmentRarity {
  const roll = random.int(10_000);
  let upperBound = 0;
  for (const rarity of RARITY_ORDER) {
    upperBound += CHEST_DEFINITIONS[chestType].odds[rarity];
    if (roll < upperBound) {
      return rarity;
    }
  }
  throw new Error("Chest odds do not cover the complete roll range.");
}

function activePityFloor(save: SaveData): EquipmentRarity | null {
  const pity = save.economy.pity;
  if (pity.sinceSPlusPlusPlus >= PITY_THRESHOLDS["S+++"] - 1) {
    return "S+++";
  }
  if (pity.sinceSPlusPlus >= PITY_THRESHOLDS["S++"] - 1) {
    return "S++";
  }
  if (pity.sinceSPlus >= PITY_THRESHOLDS["S+"] - 1) {
    return "S+";
  }
  if (pity.sinceS >= PITY_THRESHOLDS.S - 1) {
    return "S";
  }
  return null;
}

function updatePity(rarity: EquipmentRarity) {
  const rank = rarityRank(rarity);
  return {
    sinceS: rank >= rarityRank("S") ? 0 : undefined,
    sinceSPlus: rank >= rarityRank("S+") ? 0 : undefined,
    sinceSPlusPlus: rank >= rarityRank("S++") ? 0 : undefined,
    sinceSPlusPlusPlus: rank >= rarityRank("S+++") ? 0 : undefined,
  };
}

function nextPity(save: SaveData, rarity: EquipmentRarity) {
  const resets = updatePity(rarity);
  return {
    sinceS:
      resets.sinceS ??
      Math.min(PITY_THRESHOLDS.S - 1, save.economy.pity.sinceS + 1),
    sinceSPlus:
      resets.sinceSPlus ??
      Math.min(PITY_THRESHOLDS["S+"] - 1, save.economy.pity.sinceSPlus + 1),
    sinceSPlusPlus:
      resets.sinceSPlusPlus ??
      Math.min(
        PITY_THRESHOLDS["S++"] - 1,
        save.economy.pity.sinceSPlusPlus + 1,
      ),
    sinceSPlusPlusPlus:
      resets.sinceSPlusPlusPlus ??
      Math.min(
        PITY_THRESHOLDS["S+++"] - 1,
        save.economy.pity.sinceSPlusPlusPlus + 1,
      ),
  };
}

function eligibleItems(
  chestType: ChestType,
  focusDefender: DefenderId | null,
): readonly EquipmentDefinition[] {
  if (chestType === "defender-trunk" && !focusDefender) {
    throw new Error("Choose a defender before opening this chest.");
  }
  return MVP_EQUIPMENT.filter(
    (item) =>
      chestType === "royal-supply" ||
      item.defenderId === null ||
      item.defenderId === focusDefender,
  );
}

function selectItem(
  random: SeededRandom,
  candidates: readonly EquipmentDefinition[],
  rarity: EquipmentRarity,
  owned: ReadonlySet<string>,
): EquipmentDefinition {
  const exact = candidates.filter((item) => item.rarity === rarity);
  if (exact.length === 0) {
    throw new Error(`No eligible ${rarity} item exists for this chest.`);
  }
  const unowned = exact.filter((item) => !owned.has(item.id));
  const pool = unowned.length > 0 ? unowned : exact;
  return pool[random.int(pool.length)]!;
}

function selectFirstChestItem(
  random: SeededRandom,
  defenderId: DefenderId,
  rolledRarity: EquipmentRarity,
  owned: ReadonlySet<string>,
): EquipmentDefinition {
  const minimumRarity =
    rarityRank(rolledRarity) < rarityRank("B") ? "B" : rolledRarity;
  const compatible = MVP_EQUIPMENT.filter(
    (item) => item.defenderId === null || item.defenderId === defenderId,
  );
  for (
    let rank = rarityRank(minimumRarity);
    rank < RARITY_ORDER.length;
    rank += 1
  ) {
    const rarity = RARITY_ORDER[rank]!;
    const atRarity = compatible.filter((item) => item.rarity === rarity);
    if (atRarity.length > 0) {
      return selectItem(random, compatible, rarity, owned);
    }
  }
  throw new Error("No compatible first-chest item is available.");
}

export interface MissionRewardLine {
  readonly kind:
    "first-clear" | "mastery" | "challenge" | "boss-bounty" | "replay";
  readonly label: string;
  readonly questCrowns: number;
  readonly craftingDust: number;
}

export interface MissionRewardResult {
  readonly save: SaveData;
  readonly receipt: EconomyReceipt | null;
  readonly lines: readonly MissionRewardLine[];
}

function replayReward(save: SaveData, levelId: string): MissionRewardLine {
  const streak =
    save.economy.replayStreak?.levelId === levelId
      ? save.economy.replayStreak.count + 1
      : 1;
  if (!save.economy.replayHistory.includes(levelId)) {
    return {
      kind: "replay",
      label: "Varied replay",
      questCrowns: 30,
      craftingDust: 0,
    };
  }
  if (save.economy.replayHistory[0] !== levelId) {
    return {
      kind: "replay",
      label: "Nonconsecutive replay",
      questCrowns: 20,
      craftingDust: 0,
    };
  }
  return {
    kind: "replay",
    label: streak === 2 ? "First consecutive replay" : "Further repeat",
    questCrowns: streak === 2 ? 10 : 5,
    craftingDust: 0,
  };
}

export function grantMissionRewards(
  save: SaveData,
  result: BattleResult,
): MissionRewardResult {
  if (result.result !== "victory") {
    return { save, receipt: null, lines: [] };
  }
  const attemptId =
    result.attemptId ??
    [
      result.levelId,
      result.seed,
      [...result.modifierIds].sort().join(".") || "normal",
      result.completedAt,
    ].join(":");
  const requestId = `mission:${attemptId}`;
  const existing = findReceipt(save, requestId);
  if (existing) {
    if (existing.kind !== "mission-reward") {
      throw new Error("The mission request ID belongs to another action.");
    }
    if (save.campaign.recordedAttemptIds.includes(`attempt:${attemptId}`)) {
      return { save, receipt: null, lines: [] };
    }
    return {
      save,
      receipt: existing,
      lines: rewardLinesFromClaims(existing.claimIds),
    };
  }

  const progress = save.campaign.levels[result.levelId];
  const lines: MissionRewardLine[] = [];
  const claimIds: string[] = [];
  if ((progress?.victories ?? 0) === 0) {
    const crowns = FIRST_CLEAR_CROWNS[result.levelId];
    if (crowns === undefined) {
      throw new Error(`Unknown mission reward: ${result.levelId}`);
    }
    lines.push({
      kind: "first-clear",
      label: "First clear",
      questCrowns: crowns,
      craftingDust: 0,
    });
    claimIds.push(`first:${result.levelId}`);
  } else {
    const replay = replayReward(save, result.levelId);
    lines.push(replay);
    claimIds.push(
      `replay:${result.levelId}:${save.campaign.recordedAttemptIds.length}:${replay.questCrowns}`,
    );
  }

  const completedMasteries = new Set(progress?.completedMasteryIds ?? []);
  for (const masteryId of result.completedMasteryIds) {
    if (!completedMasteries.has(masteryId)) {
      lines.push({
        kind: "mastery",
        label: "New mastery seal",
        questCrowns: 20,
        craftingDust: 0,
      });
      claimIds.push(`mastery:${result.levelId}:${masteryId}`);
    }
  }

  const completedModifiers = new Set(progress?.completedModifierIds ?? []);
  for (const modifierId of result.modifierIds) {
    if (!completedModifiers.has(modifierId)) {
      lines.push({
        kind: "challenge",
        label: "New challenge clear",
        questCrowns: 40,
        craftingDust: 0,
      });
      claimIds.push(`challenge:${result.levelId}:${modifierId}`);
    }
  }

  const bossClaimId = `boss:${result.levelId}`;
  if (
    BOSS_BOUNTY_LEVELS.has(result.levelId) &&
    (result.defeatedBossEnemyIds?.length ?? 0) > 0 &&
    !save.economy.rewardClaimIds.includes(bossClaimId)
  ) {
    lines.push({
      kind: "boss-bounty",
      label: "Boss Bounty secured",
      questCrowns: 30,
      craftingDust: 25,
    });
    claimIds.push(bossClaimId);
  }

  const questCrownsGranted = lines.reduce(
    (total, line) => total + line.questCrowns,
    0,
  );
  const craftingDustGranted = lines.reduce(
    (total, line) => total + line.craftingDust,
    0,
  );
  const receipt = {
    kind: "mission-reward",
    requestId,
    createdAtSequence: nextReceiptSequence(save),
    attemptId,
    questCrownsGranted,
    craftingDustGranted,
    claimIds,
  } satisfies EconomyReceipt;
  const replay = (progress?.victories ?? 0) > 0;
  const replayStreak = replay
    ? save.economy.replayStreak?.levelId === result.levelId
      ? {
          levelId: result.levelId,
          count: save.economy.replayStreak.count + 1,
        }
      : { levelId: result.levelId, count: 1 }
    : save.economy.replayStreak;

  const persistentClaimIds = claimIds.filter(
    (claimId) => !claimId.startsWith("replay:"),
  );
  const rewardClaimIds = Array.from(
    new Set([...save.economy.rewardClaimIds, ...persistentClaimIds]),
  );
  if (rewardClaimIds.length > MAX_REWARD_CLAIM_IDS) {
    throw new Error(
      "This save reached its reward history safety limit. The victory was not recorded; contact support to protect the reward.",
    );
  }

  return {
    receipt,
    lines,
    save: {
      ...save,
      economy: {
        ...save.economy,
        questCrowns: save.economy.questCrowns + questCrownsGranted,
        craftingDust: save.economy.craftingDust + craftingDustGranted,
        rewardClaimIds,
        replayHistory: replay
          ? [result.levelId, ...save.economy.replayHistory].slice(0, 3)
          : save.economy.replayHistory,
        replayStreak,
        recentReceipts: appendReceipt(save, receipt),
      },
    },
  };
}

function rewardLinesFromClaims(
  claimIds: readonly string[],
): readonly MissionRewardLine[] {
  return claimIds.map((claimId) => {
    if (claimId.startsWith("mastery:")) {
      return {
        kind: "mastery",
        label: "New mastery seal",
        questCrowns: 20,
        craftingDust: 0,
      };
    }
    if (claimId.startsWith("challenge:")) {
      return {
        kind: "challenge",
        label: "New challenge clear",
        questCrowns: 40,
        craftingDust: 0,
      };
    }
    if (claimId.startsWith("boss:")) {
      return {
        kind: "boss-bounty",
        label: "Boss Bounty secured",
        questCrowns: 30,
        craftingDust: 25,
      };
    }
    if (claimId.startsWith("replay:")) {
      const questCrowns = Number(claimId.split(":").at(-1));
      return {
        kind: "replay",
        label:
          questCrowns === 30
            ? "Varied replay"
            : questCrowns === 20
              ? "Nonconsecutive replay"
              : questCrowns === 10
                ? "First consecutive replay"
                : "Further repeat",
        questCrowns,
        craftingDust: 0,
      };
    }
    const levelId = claimId.slice("first:".length);
    return {
      kind: "first-clear",
      label: "First clear",
      questCrowns: FIRST_CLEAR_CROWNS[levelId] ?? 0,
      craftingDust: 0,
    };
  });
}

export interface OpenChestRequest {
  readonly requestId: string;
  readonly chestType: ChestType;
  readonly focusDefender: DefenderId | null;
  readonly lootSeed?: string;
  readonly openSequence: number;
}

export interface EconomyTransaction {
  readonly save: SaveData;
  readonly receipt: EconomyReceipt;
}

export function openChest(
  save: SaveData,
  request: OpenChestRequest,
): EconomyTransaction {
  const existing = findReceipt(save, request.requestId);
  if (existing) {
    if (existing.kind !== "chest-opened") {
      throw new Error("The chest request ID belongs to another action.");
    }
    return { save, receipt: existing };
  }
  requireFreshRequest(save, request.requestId);
  if (request.openSequence !== save.economy.openSequence) {
    throw new Error(
      "This chest request is out of date. Refresh the chest screen before spending.",
    );
  }
  const chest = CHEST_DEFINITIONS[request.chestType];
  if (save.economy.questCrowns < chest.price) {
    throw new Error(`You need ${chest.price} Quest Crowns for this chest.`);
  }
  const lootSeed = save.economy.lootSeed ?? request.lootSeed;
  if (!lootSeed || !/^[a-fA-F0-9]{32}$/.test(lootSeed)) {
    throw new Error(
      "A secure 128-bit loot seed is required for the first chest.",
    );
  }
  if (
    request.chestType === "defender-trunk" &&
    request.focusDefender === null
  ) {
    throw new Error("Choose a defender before opening this chest.");
  }
  const firstChest = !save.guidance.firstChestOpened;
  if (firstChest && request.chestType !== "royal-supply") {
    throw new Error("Your first chest is the 120-Crown Supply Chest.");
  }
  if (firstChest && !request.focusDefender) {
    throw new Error("Choose a defender for your first-chest guarantee.");
  }

  const random = transactionRandom(
    lootSeed,
    save.economy.openSequence,
    request.chestType,
    request.focusDefender,
  );
  const rolledRarity = rollBaseRarity(random, request.chestType);
  const pityFloor = activePityFloor(save);
  const rarity =
    pityFloor && rarityRank(pityFloor) > rarityRank(rolledRarity)
      ? pityFloor
      : rolledRarity;
  const owned = new Set(save.inventory.ownedItemIds);
  const item = firstChest
    ? selectFirstChestItem(random, request.focusDefender!, rarity, owned)
    : selectItem(
        random,
        eligibleItems(request.chestType, request.focusDefender),
        rarity,
        owned,
      );
  const actualRarity = item.rarity;
  const duplicate = owned.has(item.id);
  const craftingDustGranted =
    chest.dust + (duplicate ? DUPLICATE_DUST[actualRarity] : 0);
  const metadata = duplicate
    ? save.inventory.metadata
    : {
        ...save.inventory.metadata,
        [item.id]: {
          favorite: false,
          locked: rarityRank(actualRarity) >= rarityRank("S+"),
          isNew: true,
        },
      };
  const receipt = {
    kind: "chest-opened",
    requestId: request.requestId,
    createdAtSequence: nextReceiptSequence(save),
    openSequence: save.economy.openSequence,
    chestType: request.chestType,
    focusDefender: request.focusDefender,
    rolledRarity,
    rarity: actualRarity,
    itemId: item.id,
    duplicate,
    questCrownsSpent: chest.price,
    craftingDustGranted,
  } satisfies EconomyReceipt;

  return {
    receipt,
    save: {
      ...save,
      guidance: { ...save.guidance, firstChestOpened: true },
      inventory: {
        ownedItemIds: duplicate
          ? save.inventory.ownedItemIds
          : [...save.inventory.ownedItemIds, item.id],
        metadata,
      },
      economy: {
        ...save.economy,
        questCrowns: save.economy.questCrowns - chest.price,
        craftingDust: save.economy.craftingDust + craftingDustGranted,
        rewardClaimIds: [
          ...save.economy.rewardClaimIds,
          requestGuardId(request.requestId),
        ],
        lootSeed,
        openSequence: save.economy.openSequence + 1,
        pity: nextPity(save, actualRarity),
        recentReceipts: appendReceipt(save, receipt),
      },
    },
  };
}

function mvpItem(itemId: string): EquipmentDefinition {
  const item =
    equipmentDefinitions[itemId as keyof typeof equipmentDefinitions];
  if (!item || item.phase !== "mvp") {
    throw new Error("That item is not available in the current collection.");
  }
  return item;
}

export function craftItem(
  save: SaveData,
  itemId: string,
  requestId: string,
): EconomyTransaction {
  const existing = findReceipt(save, requestId);
  if (existing) {
    if (existing.kind !== "crafted" || existing.itemId !== itemId) {
      throw new Error("The crafting request ID belongs to another action.");
    }
    return { save, receipt: existing };
  }
  requireFreshRequest(save, requestId);
  const item = mvpItem(itemId);
  if (save.inventory.ownedItemIds.includes(itemId)) {
    throw new Error("You already own this item.");
  }
  const cost = CRAFT_COST[item.rarity];
  if (save.economy.craftingDust < cost) {
    throw new Error(`You need ${cost} Crafting Dust to make this item.`);
  }
  const receipt = {
    kind: "crafted",
    requestId,
    createdAtSequence: nextReceiptSequence(save),
    itemId,
    craftingDustSpent: cost,
  } satisfies EconomyReceipt;
  return {
    receipt,
    save: {
      ...save,
      economy: {
        ...save.economy,
        craftingDust: save.economy.craftingDust - cost,
        rewardClaimIds: [
          ...save.economy.rewardClaimIds,
          requestGuardId(requestId),
        ],
        recentReceipts: appendReceipt(save, receipt),
      },
      inventory: {
        ownedItemIds: [...save.inventory.ownedItemIds, itemId],
        metadata: {
          ...save.inventory.metadata,
          [itemId]: {
            favorite: false,
            locked: rarityRank(item.rarity) >= rarityRank("S+"),
            isNew: true,
          },
        },
      },
    },
  };
}

function equippedBy(save: SaveData, itemId: string): DefenderId | null {
  for (const defenderId of Object.keys(save.loadouts) as DefenderId[]) {
    if (Object.values(save.loadouts[defenderId]).includes(itemId)) {
      return defenderId;
    }
  }
  return null;
}

export function salvageItem(
  save: SaveData,
  itemId: string,
  requestId: string,
): EconomyTransaction {
  const existing = findReceipt(save, requestId);
  if (existing) {
    if (existing.kind !== "salvaged" || existing.itemId !== itemId) {
      throw new Error("The salvage request ID belongs to another action.");
    }
    return { save, receipt: existing };
  }
  requireFreshRequest(save, requestId);
  const item = mvpItem(itemId);
  if (!save.inventory.ownedItemIds.includes(itemId)) {
    throw new Error("You do not own this item.");
  }
  if (equippedBy(save, itemId)) {
    throw new Error("Unequip this item before salvaging it.");
  }
  const metadata = save.inventory.metadata[itemId];
  if (metadata?.favorite) {
    throw new Error("Remove Favorite before salvaging this item.");
  }
  if (metadata?.locked) {
    throw new Error("Unlock this item before salvaging it.");
  }
  const craftingDustGranted = SALVAGE_DUST[item.rarity];
  const nextMetadata = { ...save.inventory.metadata };
  delete nextMetadata[itemId];
  const receipt = {
    kind: "salvaged",
    requestId,
    createdAtSequence: nextReceiptSequence(save),
    itemId,
    craftingDustGranted,
  } satisfies EconomyReceipt;
  return {
    receipt,
    save: {
      ...save,
      economy: {
        ...save.economy,
        craftingDust: save.economy.craftingDust + craftingDustGranted,
        rewardClaimIds: [
          ...save.economy.rewardClaimIds,
          requestGuardId(requestId),
        ],
        recentReceipts: appendReceipt(save, receipt),
      },
      inventory: {
        ownedItemIds: save.inventory.ownedItemIds.filter((id) => id !== itemId),
        metadata: nextMetadata,
      },
    },
  };
}

export function equipItem(
  save: SaveData,
  defenderId: DefenderId,
  slot: EquipmentSlot,
  itemId: string | null,
  requestId: string,
): EconomyTransaction {
  const existing = findReceipt(save, requestId);
  if (existing) {
    if (
      existing.kind !== "equipped" ||
      existing.itemId !== itemId ||
      existing.defenderId !== defenderId ||
      existing.slot !== slot
    ) {
      throw new Error("The equipment request ID belongs to another action.");
    }
    return { save, receipt: existing };
  }
  requireUnusedRequest(save, requestId);
  if (save.checkpoint) {
    throw new Error("Finish or abandon the current mission to change gear.");
  }
  const item = itemId ? mvpItem(itemId) : null;
  if (item && !save.inventory.ownedItemIds.includes(item.id)) {
    throw new Error("You do not own this item.");
  }
  if (item && item.slot !== slot) {
    throw new Error(`${item.name} belongs in the ${item.slot} slot.`);
  }
  if (item?.defenderId && item.defenderId !== defenderId) {
    throw new Error(`${item.name} is for ${DEFENDER_NAMES[item.defenderId]}.`);
  }

  const loadouts = {
    "fork-knight": { ...save.loadouts["fork-knight"] },
    "discount-wizard": { ...save.loadouts["discount-wizard"] },
    bardbarian: { ...save.loadouts.bardbarian },
  };
  const movedFromDefenderId =
    item && item.defenderId === null ? equippedBy(save, item.id) : null;
  if (movedFromDefenderId && movedFromDefenderId !== defenderId) {
    loadouts[movedFromDefenderId] = {
      ...loadouts[movedFromDefenderId],
      [slot]: null,
    };
  }
  loadouts[defenderId] = {
    ...loadouts[defenderId],
    [slot]: item?.id ?? null,
  };
  const receipt = {
    kind: "equipped",
    requestId,
    createdAtSequence: nextReceiptSequence(save),
    itemId: item?.id ?? null,
    defenderId,
    slot,
    movedFromDefenderId:
      movedFromDefenderId === defenderId ? null : movedFromDefenderId,
  } satisfies EconomyReceipt;
  return {
    receipt,
    save: {
      ...save,
      guidance: item
        ? { ...save.guidance, firstEquipComplete: true }
        : save.guidance,
      loadouts,
      economy: {
        ...save.economy,
        recentReceipts: appendReceipt(save, receipt),
      },
    },
  };
}

export function updateItemMetadata(
  save: SaveData,
  itemId: string,
  changes: Partial<{
    readonly favorite: boolean;
    readonly locked: boolean;
    readonly isNew: boolean;
  }>,
): SaveData {
  mvpItem(itemId);
  if (!save.inventory.ownedItemIds.includes(itemId)) {
    throw new Error("You do not own this item.");
  }
  const current = save.inventory.metadata[itemId] ?? {
    favorite: false,
    locked: false,
    isNew: false,
  };
  return {
    ...save,
    inventory: {
      ...save.inventory,
      metadata: {
        ...save.inventory.metadata,
        [itemId]: { ...current, ...changes },
      },
    },
  };
}

export function pityRemaining(save: SaveData) {
  return {
    S: PITY_THRESHOLDS.S - save.economy.pity.sinceS,
    "S+": PITY_THRESHOLDS["S+"] - save.economy.pity.sinceSPlus,
    "S++": PITY_THRESHOLDS["S++"] - save.economy.pity.sinceSPlusPlus,
    "S+++": PITY_THRESHOLDS["S+++"] - save.economy.pity.sinceSPlusPlusPlus,
  };
}

export function formatEquipmentEffect(effect: EquipmentEffect): string {
  switch (effect.kind) {
    case "stat": {
      const label = {
        damage: "Damage",
        cooldown: "Attack cooldown",
        range: "Range",
        splash: "Splash radius",
        "armor-ignore": "Armor ignored",
      }[effect.stat];
      const condition = effect.condition
        ? {
            "route-progress": " near the gate",
            "boss-route-progress": " against late-route bosses",
            armor: " against heavy armor",
            "wave-time": " at wave start",
            roster: " with other defender types deployed",
            "after-leak": " after a leak",
          }[effect.condition.kind]
        : "";
      return `${label} ${effect.percent > 0 ? "+" : ""}${effect.percent}%${condition}.`;
    }
    case "placement-discount":
      return `First wearer placement costs ${effect.amount} less gold each mission.`;
    case "secondary-target":
      return `Adds a second target at ${effect.damagePercentRanksOneToThree}% damage (${effect.damagePercentRankFour}% at rank IV); it cannot trigger item effects.`;
    case "prevent-leak-damage":
      return `Prevents ${effect.amount} life damage from the first normal leak each battle.`;
    case "attack-counter":
      if (effect.action.kind === "cooldown-percent") {
        return `Every ${effect.every}th attack starts its next cooldown ${Math.abs(effect.action.percent)}% sooner.`;
      }
      if (effect.action.kind === "echo") {
        return `Every ${effect.every}th hit echoes ${effect.action.damagePercent}% damage without triggering effects.`;
      }
      if (effect.action.kind === "push-or-boss-mark") {
        return `Every ${effect.every}th hit pushes normal enemies 6%; bosses become Set for the Party for 3 seconds.`;
      }
      return `Every ${effect.every}th hit starts a 2-second team chorus; it cannot stack.`;
    case "primary-proc":
      return `${effect.chanceBasisPoints / 100}% primary-hit chance: ${
        effect.normal.kind === "freeze"
          ? "freeze for 1 second; bosses are chilled 20% instead"
          : "turn a normal enemy into a slowed slime for 3 seconds; bosses take 25% bonus arcane damage instead"
      }.`;
    case "secondary-slow":
      return `A successful primary slow also slows one nearby normal enemy ${effect.slowPercent}% for 1 second.`;
    case "leak-haste":
      return `After a leak, attack speed +${Math.abs(effect.cooldownPercent)}% for 5 seconds, once per wave.`;
    case "support-bonus":
      return `Adds ${effect.percentagePoints} points to allied attack-speed support, capped at ${effect.capPercent}%.`;
    case "route-mark":
      return `Once per battle near the gate: slow a normal enemy 50% and deal +25% wearer damage; bosses are slowed 15% for 1 second.`;
  }
}

export function equipmentEffectCopy(item: EquipmentDefinition): string {
  return item.effects.map(formatEquipmentEffect).join(" ");
}

export function itemEligibilityCopy(item: EquipmentDefinition): string {
  return item.defenderId ? DEFENDER_NAMES[item.defenderId] : "Any defender";
}

export function itemIsEquipped(save: SaveData, itemId: string): boolean {
  return equippedBy(save, itemId) !== null;
}

export function eligibleDefenders(
  item: EquipmentDefinition,
): readonly DefenderId[] {
  return item.defenderId
    ? [item.defenderId]
    : (Object.keys(DEFENDER_NAMES) as DefenderId[]);
}

export function equippedItemId(
  save: SaveData,
  defenderId: DefenderId,
  slot: EquipmentSlot,
): EquipmentId | null {
  const itemId = save.loadouts[defenderId][slot];
  return itemId as EquipmentId | null;
}

export function mvpItemsForSlot(
  defenderId: DefenderId,
  slot: EquipmentSlot,
): readonly EquipmentDefinition[] {
  return MVP_EQUIPMENT.filter(
    (item) =>
      item.slot === slot &&
      (item.defenderId === null || item.defenderId === defenderId),
  );
}

export function loadoutItemNames(
  save: SaveData,
  defenderId: DefenderId,
): readonly string[] {
  return EQUIPMENT_SLOT_ORDER.map((slot) => save.loadouts[defenderId][slot])
    .filter((itemId): itemId is string => Boolean(itemId))
    .map(
      (itemId) =>
        equipmentDefinitions[itemId as keyof typeof equipmentDefinitions]
          ?.name ?? itemId,
    );
}
