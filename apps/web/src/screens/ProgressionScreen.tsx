import {
  CHEST_DEFINITIONS,
  CRAFT_COST,
  DEFENDER_NAMES,
  DUPLICATE_DUST,
  EQUIPMENT_SLOT_ORDER,
  MVP_EQUIPMENT,
  RARITY_ORDER,
  SALVAGE_DUST,
  craftItem,
  eligibleDefenders,
  equipItem,
  equipmentDefinitions,
  equipmentEffectCopy,
  itemEligibilityCopy,
  itemIsEquipped,
  openChest,
  pityRemaining,
  salvageItem,
  updateItemMetadata,
  type ChestType,
  type EquipmentDefinition,
} from "@srtg/game-core";
import type {
  DefenderId,
  EconomyReceipt,
  EquipmentRarity,
  EquipmentSlot,
  SaveData,
} from "@srtg/protocol";
import { useEffect, useMemo, useRef, useState } from "react";

import { HubNavigation, type HubTab } from "../components/HubNavigation.js";

interface ProgressionScreenProps {
  readonly tab: Exclude<HubTab, "campaign">;
  readonly save: SaveData;
  readonly syncStatus: string;
  readonly selectedItemId: string | null;
  readonly onSelectedItem: (itemId: string | null) => void;
  readonly onCommit: (save: SaveData) => Promise<void>;
  readonly onHome: () => void;
  readonly onNavigate: (tab: HubTab) => void;
}

type InventoryStatus = "all" | "owned" | "new" | "favorite" | "locked";
type SortMode = "newest" | "name" | "rarity";

function secureHex(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (part) => part.toString(16).padStart(2, "0")).join(
    "",
  );
}

function actionId(prefix: string): string {
  return `${prefix}:${secureHex(12)}`;
}

function ownerOf(save: SaveData, itemId: string): DefenderId | null {
  for (const defenderId of Object.keys(DEFENDER_NAMES) as DefenderId[]) {
    if (Object.values(save.loadouts[defenderId]).includes(itemId)) {
      return defenderId;
    }
  }
  return null;
}

function oddsCopy(chestType: ChestType): string {
  const odds = CHEST_DEFINITIONS[chestType].odds;
  return RARITY_ORDER.filter((rarity) => odds[rarity] > 0)
    .map((rarity) => `${rarity} ${odds[rarity] / 100}%`)
    .join(" · ");
}

function ownedItemCount(
  ownedItemIds: readonly string[],
  itemId: string,
): number {
  return ownedItemIds.filter((ownedItemId) => ownedItemId === itemId).length;
}

function RarityBadge({ rarity }: { readonly rarity: EquipmentRarity }) {
  return (
    <span className={`rarity rarity-${rarity.replaceAll("+", "plus")}`}>
      <span aria-hidden="true">◆</span> {rarity}
    </span>
  );
}

function ItemDetails({
  item,
  save,
  selectedDefender,
  onDefender,
  onCommit,
}: {
  readonly item: EquipmentDefinition;
  readonly save: SaveData;
  readonly selectedDefender: DefenderId;
  readonly onDefender: (defender: DefenderId) => void;
  readonly onCommit: (save: SaveData) => Promise<void>;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<
    "equip" | "unequip" | "craft" | "salvage" | null
  >(null);
  const owned = save.inventory.ownedItemIds.includes(item.id);
  const metadata = save.inventory.metadata[item.id];
  const equipped = itemIsEquipped(save, item.id);
  const owner = ownerOf(save, item.id);
  const eligible = eligibleDefenders(item);
  const defender = eligible.includes(selectedDefender)
    ? selectedDefender
    : eligible[0]!;
  const currentId = save.loadouts[defender][item.slot];
  const current = currentId
    ? equipmentDefinitions[currentId as keyof typeof equipmentDefinitions]
    : null;
  const loadoutLocked = Boolean(save.checkpoint);
  const salvageReason = equipped
    ? "Unequip it first."
    : metadata?.favorite
      ? "Remove Favorite first."
      : metadata?.locked
        ? "Unlock it first."
        : null;

  async function perform(action: "equip" | "unequip" | "craft" | "salvage") {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const transaction =
        action === "equip" || action === "unequip"
          ? equipItem(
              save,
              defender,
              item.slot,
              action === "equip" ? item.id : null,
              actionId(action),
            )
          : action === "craft"
            ? craftItem(save, item.id, actionId("craft"))
            : salvageItem(save, item.id, actionId("salvage"));
      await onCommit(transaction.save);
      setConfirm(null);
      setMessage(
        action === "equip" || action === "unequip"
          ? `${item.name} ${action === "equip" ? "equipped" : "unequipped"} for ${DEFENDER_NAMES[defender]}.`
          : action === "craft"
            ? `${item.name} crafted directly. No pity changed.`
            : `${item.name} became ${SALVAGE_DUST[item.rarity]} Dust.`,
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "That gear action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="item-detail card" aria-live="polite">
      <div className="item-detail-heading">
        <RarityBadge rarity={item.rarity} />
        {metadata?.isNew && <span className="new-badge">New</span>}
      </div>
      <h2>{item.name}</h2>
      <p className="item-flavor">“{item.flavor}”</p>
      <p>
        <strong>{item.slot}</strong> · {itemEligibilityCopy(item)}
      </p>
      <p className="effect-copy">{equipmentEffectCopy(item)}</p>
      <details>
        <summary>Details and boss rules</summary>
        <p>
          Fixed authored effect. No random stats or item levels. Boss controls
          use the listed safe conversion and never skip boss phases.
        </p>
      </details>
      {eligible.length > 1 && (
        <label>
          Equip for
          <select
            value={defender}
            onChange={(event) => onDefender(event.target.value as DefenderId)}
          >
            {eligible.map((defenderId) => (
              <option key={defenderId} value={defenderId}>
                {DEFENDER_NAMES[defenderId]}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="compare-grid">
        <article>
          <small>Currently equipped</small>
          <strong>{current?.name ?? `Empty ${item.slot}`}</strong>
          <span>
            {current
              ? equipmentEffectCopy(current)
              : "Empty gear never blocks a mission."}
          </span>
        </article>
        <article>
          <small>Candidate</small>
          <strong>{item.name}</strong>
          <span>{equipmentEffectCopy(item)}</span>
        </article>
      </div>
      {owned ? (
        <>
          <div className="item-actions">
            <button
              className="button button-primary"
              onClick={() =>
                setConfirm(currentId === item.id ? "unequip" : "equip")
              }
              disabled={loadoutLocked}
              title={
                loadoutLocked
                  ? "Finish or abandon the current mission to change gear."
                  : undefined
              }
            >
              {currentId === item.id ? "Unequip" : "Equip"}
            </button>
            <button
              className="button button-ghost"
              aria-pressed={metadata?.favorite ?? false}
              onClick={() =>
                void onCommit(
                  updateItemMetadata(save, item.id, {
                    favorite: !(metadata?.favorite ?? false),
                  }),
                )
              }
            >
              {metadata?.favorite ? "Unfavorite" : "Favorite"}
            </button>
            <button
              className="button button-ghost"
              aria-pressed={metadata?.locked ?? false}
              onClick={() =>
                void onCommit(
                  updateItemMetadata(save, item.id, {
                    locked: !(metadata?.locked ?? false),
                  }),
                )
              }
            >
              {metadata?.locked ? "Unlock" : "Lock"}
            </button>
            <button
              className="button button-danger"
              onClick={() => setConfirm("salvage")}
              disabled={Boolean(salvageReason)}
              title={salvageReason ?? undefined}
            >
              Salvage for {SALVAGE_DUST[item.rarity]} Dust
            </button>
          </div>
          {(loadoutLocked || salvageReason) && (
            <p className="disabled-reason">
              {loadoutLocked
                ? "Finish or abandon the current mission to change gear. "
                : ""}
              {salvageReason}
            </p>
          )}
        </>
      ) : (
        <>
          <button
            className="button button-primary button-wide"
            disabled={save.economy.craftingDust < CRAFT_COST[item.rarity]}
            onClick={() => setConfirm("craft")}
          >
            Craft exactly this item · {CRAFT_COST[item.rarity]} Dust
          </button>
          {save.economy.craftingDust < CRAFT_COST[item.rarity] && (
            <p className="disabled-reason">
              You need {CRAFT_COST[item.rarity] - save.economy.craftingDust}{" "}
              more Dust.
            </p>
          )}
        </>
      )}
      {message && <p className="action-message">{message}</p>}
      {confirm && (
        <div className="inline-confirm" role="dialog" aria-modal="true">
          <strong>
            {confirm === "equip"
              ? owner && owner !== defender
                ? `Move ${item.name} from ${DEFENDER_NAMES[owner]} to ${DEFENDER_NAMES[defender]}?`
                : `Equip ${item.name} for ${DEFENDER_NAMES[defender]}?`
              : confirm === "unequip"
                ? `Unequip ${item.name} from ${DEFENDER_NAMES[defender]}?`
                : confirm === "craft"
                  ? `Craft ${item.name} for ${CRAFT_COST[item.rarity]} Dust?`
                  : `Salvage ${item.name} for ${SALVAGE_DUST[item.rarity]} Dust?`}
          </strong>
          <p>
            {confirm === "salvage"
              ? `It leaves your collection. Recrafting costs ${CRAFT_COST[item.rarity]} Dust.`
              : confirm === "craft"
                ? "You receive this exact item. Crafting does not change chest pity."
                : confirm === "unequip"
                  ? "The slot becomes empty. Empty gear never blocks a mission."
                  : "Loadouts affect new missions only."}
          </p>
          <div className="result-actions">
            <button
              className="button button-ghost"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              onClick={() => void perform(confirm)}
              disabled={busy}
            >
              {busy ? "Saving…" : `Confirm ${confirm}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DefendersView({
  save,
  selectedItemId,
  onSelectedItem,
  onCommit,
  onNavigate,
}: Pick<
  ProgressionScreenProps,
  "save" | "selectedItemId" | "onSelectedItem" | "onCommit" | "onNavigate"
>) {
  const [defenderFilter, setDefenderFilter] = useState<DefenderId | "all">(
    "all",
  );
  const [selectedDefender, setSelectedDefender] =
    useState<DefenderId>("fork-knight");
  const [slotFilter, setSlotFilter] = useState<EquipmentSlot | "all">("all");
  const [rarityFilter, setRarityFilter] = useState<EquipmentRarity | "all">(
    "all",
  );
  const [statusFilter, setStatusFilter] = useState<InventoryStatus>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortMode>("newest");
  const selected = selectedItemId
    ? (equipmentDefinitions[
        selectedItemId as keyof typeof equipmentDefinitions
      ] ?? null)
    : null;

  const items = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return [...MVP_EQUIPMENT]
      .filter(
        (item) =>
          defenderFilter === "all" ||
          item.defenderId === null ||
          item.defenderId === defenderFilter,
      )
      .filter((item) => slotFilter === "all" || item.slot === slotFilter)
      .filter((item) => rarityFilter === "all" || item.rarity === rarityFilter)
      .filter((item) => {
        const owned = save.inventory.ownedItemIds.includes(item.id);
        const metadata = save.inventory.metadata[item.id];
        return (
          statusFilter === "all" ||
          (statusFilter === "owned" && owned) ||
          (statusFilter === "new" && metadata?.isNew) ||
          (statusFilter === "favorite" && metadata?.favorite) ||
          (statusFilter === "locked" && metadata?.locked)
        );
      })
      .filter(
        (item) =>
          !lowered ||
          `${item.name} ${item.flavor} ${equipmentEffectCopy(item)}`
            .toLowerCase()
            .includes(lowered),
      )
      .sort((left, right) => {
        if (sort === "name") {
          return left.name.localeCompare(right.name);
        }
        if (sort === "rarity") {
          return (
            RARITY_ORDER.indexOf(right.rarity) -
            RARITY_ORDER.indexOf(left.rarity)
          );
        }
        return (
          save.inventory.ownedItemIds.indexOf(right.id) -
          save.inventory.ownedItemIds.indexOf(left.id)
        );
      });
  }, [
    defenderFilter,
    rarityFilter,
    save.inventory.metadata,
    save.inventory.ownedItemIds,
    search,
    slotFilter,
    sort,
    statusFilter,
  ]);

  async function selectItem(item: EquipmentDefinition) {
    onSelectedItem(item.id);
    if (item.defenderId) {
      setSelectedDefender(item.defenderId);
    }
    if (save.inventory.metadata[item.id]?.isNew) {
      await onCommit(updateItemMetadata(save, item.id, { isNew: false }));
    }
  }

  return (
    <>
      <section className="progression-heading">
        <div>
          <span className="eyebrow">Inventory has no capacity limit</span>
          <h1>Defenders and gear</h1>
        </div>
        <p>
          Each defender has one weapon, armor, and charm. Empty slots are always
          allowed.
        </p>
      </section>
      {save.guidance.firstChestOpened && (
        <section className="first-chest-guide card">
          <strong>
            {save.guidance.firstEquipComplete
              ? "Gear lesson complete."
              : "Now compare your new item and press Equip."}
          </strong>
          {save.guidance.firstEquipComplete ? (
            <button
              className="button button-primary"
              onClick={() => onNavigate("campaign")}
            >
              Continue to Mission 2
            </button>
          ) : (
            <span>
              The three paper-doll slots show where weapon, armor, and charm
              gear goes.
            </span>
          )}
        </section>
      )}
      <section className="paper-dolls" aria-label="Defender loadouts">
        {(Object.keys(DEFENDER_NAMES) as DefenderId[]).map((defenderId) => (
          <article className="paper-doll card" key={defenderId}>
            <span className="eyebrow">{DEFENDER_NAMES[defenderId]}</span>
            <div className="paper-doll-slots">
              {EQUIPMENT_SLOT_ORDER.map((slot) => {
                const itemId = save.loadouts[defenderId][slot];
                const item = itemId
                  ? equipmentDefinitions[
                      itemId as keyof typeof equipmentDefinitions
                    ]
                  : null;
                return (
                  <button
                    key={slot}
                    onClick={() => {
                      setSelectedDefender(defenderId);
                      if (item) {
                        onSelectedItem(item.id);
                      }
                    }}
                    disabled={!item}
                    title={item ? equipmentEffectCopy(item) : `Empty ${slot}`}
                  >
                    <small>{slot}</small>
                    <strong>{item?.name ?? "Empty"}</strong>
                    <span>
                      {item ? equipmentEffectCopy(item) : "No gear needed"}
                    </span>
                  </button>
                );
              })}
            </div>
          </article>
        ))}
      </section>
      <section className="inventory-layout">
        <div className="inventory-panel card">
          <div className="inventory-filters">
            <label>
              Search
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name or effect"
              />
            </label>
            <label>
              Defender
              <select
                value={defenderFilter}
                onChange={(event) =>
                  setDefenderFilter(event.target.value as DefenderId | "all")
                }
              >
                <option value="all">All defenders</option>
                {Object.entries(DEFENDER_NAMES).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Slot
              <select
                value={slotFilter}
                onChange={(event) =>
                  setSlotFilter(event.target.value as EquipmentSlot | "all")
                }
              >
                <option value="all">All slots</option>
                {EQUIPMENT_SLOT_ORDER.map((slot) => (
                  <option key={slot}>{slot}</option>
                ))}
              </select>
            </label>
            <label>
              Rarity
              <select
                value={rarityFilter}
                onChange={(event) =>
                  setRarityFilter(event.target.value as EquipmentRarity | "all")
                }
              >
                <option value="all">All rarities</option>
                {RARITY_ORDER.map((rarity) => (
                  <option key={rarity}>{rarity}</option>
                ))}
              </select>
            </label>
            <label>
              State
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as InventoryStatus)
                }
              >
                <option value="all">All items</option>
                <option value="owned">Owned</option>
                <option value="new">New</option>
                <option value="favorite">Favorite</option>
                <option value="locked">Locked</option>
              </select>
            </label>
            <label>
              Sort
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortMode)}
              >
                <option value="newest">Newest</option>
                <option value="name">Name</option>
                <option value="rarity">Rarity</option>
              </select>
            </label>
          </div>
          <div className="inventory-list">
            {items.map((item) => {
              const owned = save.inventory.ownedItemIds.includes(item.id);
              const metadata = save.inventory.metadata[item.id];
              return (
                <button
                  key={item.id}
                  className={selected?.id === item.id ? "is-selected" : ""}
                  onClick={() => void selectItem(item)}
                >
                  <span>
                    <RarityBadge rarity={item.rarity} />
                    {metadata?.isNew && <span className="new-badge">New</span>}
                  </span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.slot} · {itemEligibilityCopy(item)}
                  </small>
                  <span>
                    {owned ? "Owned" : `${CRAFT_COST[item.rarity]} Dust`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {selected ? (
          <ItemDetails
            item={selected}
            save={save}
            selectedDefender={selectedDefender}
            onDefender={setSelectedDefender}
            onCommit={onCommit}
          />
        ) : (
          <section className="item-detail card empty-detail">
            <h2>Choose an item</h2>
            <p>Compare its exact effect, then equip or craft it.</p>
          </section>
        )}
      </section>
    </>
  );
}

function ChestsView({
  save,
  onCommit,
  onNavigate,
  onSelectedItem,
}: Pick<
  ProgressionScreenProps,
  "save" | "onCommit" | "onNavigate" | "onSelectedItem"
>) {
  const [focusDefender, setFocusDefender] = useState<DefenderId>("fork-knight");
  const [confirmType, setConfirmType] = useState<ChestType | null>(null);
  const [receipt, setReceipt] = useState<EconomyReceipt | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);
  const pity = pityRemaining(save);
  const firstChest = !save.guidance.firstChestOpened;

  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
      }
    },
    [],
  );

  async function purchase(chestType: ChestType) {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const transaction = openChest(save, {
        requestId: actionId("chest"),
        chestType,
        focusDefender:
          chestType === "defender-trunk" || firstChest ? focusDefender : null,
        lootSeed: save.economy.lootSeed ?? secureHex(16),
        openSequence: save.economy.openSequence,
      });
      await onCommit(transaction.save);
      setConfirmType(null);
      setReceipt(transaction.receipt);
      const animate = !save.settings.reducedMotion && !save.settings.lowEffects;
      setRevealing(animate);
      if (animate) {
        timer.current = window.setTimeout(() => setRevealing(false), 900);
      }
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "The chest stayed stubbornly shut.",
      );
    } finally {
      setBusy(false);
    }
  }

  const openedItem =
    receipt?.kind === "chest-opened"
      ? equipmentDefinitions[
          receipt.itemId as keyof typeof equipmentDefinitions
        ]
      : null;

  return (
    <>
      <section className="progression-heading">
        <div>
          <span className="eyebrow">Gameplay-earned currency only</span>
          <h1>One chest. One authored item.</h1>
        </div>
        <p>
          No paid currency, timers, random stats, or “almost won” tricks. See
          every chance before spending.
        </p>
      </section>
      {firstChest && (
        <section className="first-chest-guide card" role="status">
          <strong>Your first gear lesson</strong>
          <span>
            1. Choose a defender. 2. Open one item. 3. Compare and equip.
          </span>
          <small>
            The first Supply Chest guarantees B or better compatible gear and
            prefers something new.
          </small>
        </section>
      )}
      <section className="pity-card card">
        <div>
          <span className="eyebrow">Visible guarantees</span>
          <strong>S or better within {pity.S} chests</strong>
          <span>
            S+ within {pity["S+"]} · S++ within {pity["S++"]} · S+++ within{" "}
            {pity["S+++"]}
          </span>
        </div>
        <details>
          <summary>How pity works</summary>
          <p>
            Shared by both chests. Guarantees trigger on opening 5, 12, 30, and
            60. The highest active guarantee wins; higher natural results stay
            higher. Matching results reset their counters.
          </p>
        </details>
      </section>
      <label className="focus-picker">
        Focus defender
        <select
          value={focusDefender}
          onChange={(event) =>
            setFocusDefender(event.target.value as DefenderId)
          }
        >
          {Object.entries(DEFENDER_NAMES).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <section className="chest-grid">
        {(Object.keys(CHEST_DEFINITIONS) as ChestType[]).map((chestType) => {
          const chest = CHEST_DEFINITIONS[chestType];
          const disabled =
            save.economy.questCrowns < chest.price ||
            (firstChest && chestType !== "royal-supply");
          const reason =
            firstChest && chestType !== "royal-supply"
              ? "Open the guided Supply Chest first."
              : save.economy.questCrowns < chest.price
                ? `You need ${chest.price - save.economy.questCrowns} more Crowns.`
                : null;
          return (
            <article className="chest-card card" key={chestType}>
              <span className="chest-icon" aria-hidden="true">
                {chestType === "royal-supply" ? "▣" : "▤"}
              </span>
              <h2>{chest.name}</h2>
              <strong>{chest.price} Quest Crowns</strong>
              <p>
                {chestType === "royal-supply"
                  ? "Any of the 19 MVP items."
                  : `Class gear for ${DEFENDER_NAMES[focusDefender]} plus universal gear.`}
              </p>
              <p className="odds-copy">
                <strong>Exact base-roll odds before guarantees:</strong>{" "}
                {oddsCopy(chestType)}
              </p>
              <p>
                Every chest gives {chest.dust} Dust. Duplicates become{" "}
                {RARITY_ORDER.map(
                  (rarity) => `${rarity} ${DUPLICATE_DUST[rarity]}`,
                ).join(" · ")}{" "}
                extra Dust.
              </p>
              <small>{chest.expectedReplayCopy}</small>
              <button
                className="button button-primary button-wide"
                onClick={() => setConfirmType(chestType)}
                disabled={disabled}
                title={reason ?? undefined}
              >
                Review purchase
              </button>
              {reason && <span className="disabled-reason">{reason}</span>}
            </article>
          );
        })}
      </section>
      <section
        className="chest-catalog"
        aria-labelledby="chest-catalog-heading"
      >
        <div className="chest-catalog-heading">
          <div>
            <span className="eyebrow">No mystery silhouettes</span>
            <h2 id="chest-catalog-heading">
              Everything the chests can cough up
            </h2>
          </div>
          <p>
            All {MVP_EQUIPMENT.length} possible items, including the ones still
            hiding under the royal packing straw.
          </p>
        </div>
        <div className="chest-catalog-grid">
          {MVP_EQUIPMENT.map((item) => {
            const ownedCount = ownedItemCount(
              save.inventory.ownedItemIds,
              item.id,
            );
            return (
              <article className="chest-catalog-item card" key={item.id}>
                {ownedCount > 0 && (
                  <span
                    className="owned-count-badge"
                    aria-label={`Owned quantity: ${ownedCount}`}
                  >
                    ×{ownedCount}
                  </span>
                )}
                <RarityBadge rarity={item.rarity} />
                <h3>{item.name}</h3>
                <p className="item-flavor">“{item.flavor}”</p>
                <small>
                  {item.slot} · {itemEligibilityCopy(item)}
                </small>
              </article>
            );
          })}
        </div>
      </section>
      {message && (
        <p className="action-message" role="alert">
          {message}
        </p>
      )}
      {confirmType && (
        <div className="modal-backdrop">
          <section
            className="purchase-dialog card"
            role="dialog"
            aria-modal="true"
          >
            <span className="eyebrow">Confirm one chest</span>
            <h2>Spend {CHEST_DEFINITIONS[confirmType].price} Quest Crowns?</h2>
            <p>
              You will receive exactly one item plus{" "}
              {CHEST_DEFINITIONS[confirmType].dust} Dust. Current balance:{" "}
              {save.economy.questCrowns} Crowns.
            </p>
            <p>
              <strong>Base-roll odds before guarantees:</strong>{" "}
              {oddsCopy(confirmType)}
            </p>
            <div className="result-actions">
              <button
                className="button button-ghost"
                onClick={() => setConfirmType(null)}
                disabled={busy}
              >
                Keep my Crowns
              </button>
              <button
                className="button button-primary"
                onClick={() => void purchase(confirmType)}
                disabled={busy}
              >
                {busy ? "Saving chest…" : "Confirm and open one"}
              </button>
            </div>
          </section>
        </div>
      )}
      {receipt?.kind === "chest-opened" && openedItem && (
        <div className="modal-backdrop">
          <section
            className={`chest-reveal card ${revealing ? "is-revealing" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-live="assertive"
          >
            {revealing ? (
              <>
                <span className="chest-icon" aria-hidden="true">
                  ▣
                </span>
                <h2>The chest is checking its pockets…</h2>
                <button
                  className="button button-ghost"
                  onClick={() => setRevealing(false)}
                >
                  Skip reveal
                </button>
              </>
            ) : (
              <>
                <RarityBadge rarity={receipt.rarity} />
                <h2>{openedItem.name}</h2>
                <p className="item-flavor">“{openedItem.flavor}”</p>
                <p>
                  <strong>{openedItem.slot}</strong> ·{" "}
                  {itemEligibilityCopy(openedItem)}
                </p>
                <p>{equipmentEffectCopy(openedItem)}</p>
                <strong>
                  {receipt.duplicate
                    ? `Duplicate converted: +${receipt.craftingDustGranted} Dust total`
                    : `New item · +${receipt.craftingDustGranted} Dust`}
                </strong>
                <div className="result-actions">
                  {!receipt.duplicate && (
                    <button
                      className="button button-primary"
                      onClick={() => {
                        onSelectedItem(receipt.itemId);
                        onNavigate("defenders");
                      }}
                    >
                      Compare &amp; equip
                    </button>
                  )}
                  <button
                    className="button button-ghost"
                    onClick={() => setReceipt(null)}
                  >
                    Back to chests
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </>
  );
}

export function ProgressionScreen({
  tab,
  save,
  syncStatus,
  selectedItemId,
  onSelectedItem,
  onCommit,
  onHome,
  onNavigate,
}: ProgressionScreenProps) {
  return (
    <main className="campaign-screen progression-screen">
      <HubNavigation
        active={tab}
        save={save}
        syncStatus={syncStatus}
        onHome={onHome}
        onNavigate={onNavigate}
      />
      <div className="progression-content">
        {tab === "defenders" ? (
          <DefendersView
            save={save}
            selectedItemId={selectedItemId}
            onSelectedItem={onSelectedItem}
            onCommit={onCommit}
            onNavigate={onNavigate}
          />
        ) : (
          <ChestsView
            save={save}
            onCommit={onCommit}
            onNavigate={onNavigate}
            onSelectedItem={onSelectedItem}
          />
        )}
      </div>
    </main>
  );
}
