import {
  enemyDefinitions,
  muddyMoatLevel,
  TICK_MS,
  towerDefinitions,
  type EnemyState,
  type GameEvent,
  type GameState,
  type Point,
  type Simulation,
  type TowerState,
} from "@srtg/game-core";
import type { GameCommand, GameSpeed } from "@srtg/protocol";
import Phaser from "phaser";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from "react";

export interface BattlefieldHandle {
  dispatch(command: GameCommand): boolean;
  confirmPlacement(preview: PlacementPreview): boolean;
  setPaused(paused: boolean): void;
  setSpeed(speed: GameSpeed): void;
}

export interface PlacementPreview {
  readonly towerId: string;
  readonly padId: string;
}

interface BattlefieldProps {
  readonly simulation: Simulation;
  readonly placementPreview: PlacementPreview | null;
  readonly managementDisabled: boolean;
  readonly gameSpeed: GameSpeed;
  readonly lowEffects: boolean;
  readonly reducedMotion: boolean;
  readonly onState: (state: GameState, events: readonly GameEvent[]) => void;
  readonly onTowerSelected: (tower: TowerState | null) => void;
  readonly onPlacementPreview: (preview: PlacementPreview | null) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onError: (message: string) => void;
}

interface SceneCallbacks {
  readonly onState: BattlefieldProps["onState"];
  readonly onTowerSelected: BattlefieldProps["onTowerSelected"];
  readonly onPlacementPreview: BattlefieldProps["onPlacementPreview"];
  readonly onPauseChanged: BattlefieldProps["onPauseChanged"];
  readonly onError: BattlefieldProps["onError"];
  readonly onControlsChanged: (controls: CanvasControlState) => void;
}

const DECORATIONS = [
  [31, 43, 12],
  [91, 480, 8],
  [332, 70, 10],
  [443, 467, 13],
  [689, 60, 9],
  [910, 85, 12],
] as const;

const MAX_TRANSIENT_EFFECTS = 24;
const WHEEL_BUTTON_SIZE = 52;
const ACTION_BUTTON_SIZE = 48;
const CONTROL_GAP = 8;
const CONTROL_ROW_OFFSET = 58;

interface CanvasControlState {
  readonly wheelPadId: string | null;
  readonly selectedTowerInstanceId: string | null;
}

interface CanvasFrame {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const EMPTY_CONTROLS: CanvasControlState = {
  wheelPadId: null,
  selectedTowerInstanceId: null,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function controlRowPositions(
  anchor: Point,
  frame: CanvasFrame,
  count: number,
  size: number,
): readonly Point[] {
  const gap = CONTROL_GAP;
  const width = count * size + (count - 1) * gap;
  const scaledAnchor = {
    x: (anchor.x / muddyMoatLevel.width) * frame.width,
    y: (anchor.y / muddyMoatLevel.height) * frame.height,
  };
  const firstCenterX = clamp(
    scaledAnchor.x - width / 2 + size / 2,
    size / 2,
    Math.max(size / 2, frame.width - width + size / 2),
  );
  const preferredY =
    scaledAnchor.y < frame.height / 2
      ? scaledAnchor.y + CONTROL_ROW_OFFSET
      : scaledAnchor.y - CONTROL_ROW_OFFSET;
  const y = clamp(preferredY, size / 2, frame.height - size / 2);

  return Array.from({ length: count }, (_, index) => ({
    x: firstCenterX + index * (size + gap),
    y,
  }));
}

function controlStyle(frame: CanvasFrame, position: Point): CSSProperties {
  return {
    left: frame.left + position.x,
    top: frame.top + position.y,
  };
}

function worldToCanvasPosition(point: Point, frame: CanvasFrame): Point {
  return {
    x: (point.x / muddyMoatLevel.width) * frame.width,
    y: (point.y / muddyMoatLevel.height) * frame.height,
  };
}

function contextLabelPosition(
  anchor: Point,
  controls: readonly Point[],
  frame: CanvasFrame,
): Point {
  const scaledAnchor = worldToCanvasPosition(anchor, frame);
  const controlY = controls[0]?.y ?? scaledAnchor.y;
  return {
    x:
      controls.reduce((total, control) => total + control.x, 0) /
      Math.max(1, controls.length),
    y: clamp(
      controlY > scaledAnchor.y ? controlY - 36 : controlY + 36,
      14,
      frame.height - 14,
    ),
  };
}

function padName(padId: string): string {
  return padId.replaceAll("-", " ");
}

interface EnemySnapshot extends Point {
  readonly color: number;
  readonly boss: boolean;
}

interface TransientEffect extends Point {
  readonly kind: "spawn" | "defeat" | "leak" | "boss-phase" | "ability";
  readonly color: number;
  readonly startedAtTick: number;
  readonly variant: number;
}

class BattleScene extends Phaser.Scene {
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private effectsGraphics!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private pausedByPlayer = false;
  private speed: GameSpeed = 1;
  private selectedTowerInstanceId: string | null = null;
  private placementPreview: PlacementPreview | null = null;
  private wheelPadId: string | null = null;
  private enemySnapshots = new Map<string, EnemySnapshot>();
  private transientEffects: TransientEffect[] = [];

  public constructor(
    private readonly simulation: Simulation,
    private readonly callbacks: SceneCallbacks,
    private lowEffects: boolean,
    private reducedMotion: boolean,
    private managementDisabled: boolean,
    initialPlacementPreview: PlacementPreview | null,
  ) {
    super({ key: "battle" });
    this.placementPreview = initialPlacementPreview;
  }

  public create(): void {
    this.mapGraphics = this.add.graphics();
    this.effectsGraphics = this.add.graphics();
    this.game.canvas.addEventListener(
      "pointerdown",
      this.handleCanvasPointerDown,
    );
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener(
        "pointerdown",
        this.handleCanvasPointerDown,
      );
      document.removeEventListener("visibilitychange", this.handleVisibility);
    });
    this.publishControls();
    this.renderState(this.simulation.state, []);
    this.callbacks.onState(this.simulation.state, []);
  }

  public override update(_time: number, delta: number): void {
    if (this.pausedByPlayer || this.simulation.state.phase !== "active") {
      return;
    }

    this.accumulator += Math.min(delta, 250) * this.speed;
    while (this.accumulator >= TICK_MS) {
      const result = this.simulation.step();
      this.accumulator -= TICK_MS;
      this.reconcileControls(result.state);
      this.renderState(result.state, result.events);
      this.callbacks.onState(result.state, result.events);
      if (result.state.phase !== "active") {
        this.accumulator = 0;
        break;
      }
    }
  }

  public dispatch(command: GameCommand): boolean {
    try {
      const result = this.simulation.dispatch(command);
      this.reconcileControls(result.state);
      this.renderState(result.state, result.events);
      this.callbacks.onState(result.state, result.events);
      return true;
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "That heroic act failed.",
      );
      return false;
    }
  }

  public confirmPlacement(preview: PlacementPreview): boolean {
    const placed = this.dispatch({
      type: "place-tower",
      towerId: preview.towerId,
      padId: preview.padId,
    });
    if (!placed) {
      return false;
    }

    this.placementPreview = null;
    const tower = this.simulation.state.towers.find(
      (candidate) => candidate.padId === preview.padId,
    );
    this.selectedTowerInstanceId = tower?.id ?? null;
    this.callbacks.onTowerSelected(tower ?? null);
    this.publishControls();
    this.renderState(this.simulation.state, []);
    return true;
  }

  public setPlacementPreview(preview: PlacementPreview | null): void {
    this.placementPreview = preview;
    this.renderState(this.simulation.state, []);
  }

  public setManagementDisabled(disabled: boolean): void {
    this.managementDisabled = disabled;
    if (!disabled || (!this.wheelPadId && !this.placementPreview)) {
      return;
    }
    this.wheelPadId = null;
    this.placementPreview = null;
    this.callbacks.onPlacementPreview(null);
    this.publishControls();
    this.renderState(this.simulation.state, []);
  }

  public chooseWheelOption(towerId: string): void {
    if (this.managementDisabled || !this.wheelPadId) {
      this.callbacks.onError("Tower management is unavailable right now.");
      return;
    }
    if (!Object.hasOwn(towerDefinitions, towerId)) {
      this.callbacks.onError("That hero is not available.");
      return;
    }
    const padId = this.wheelPadId;
    this.wheelPadId = null;
    this.callbacks.onPlacementPreview({ towerId, padId });
    this.publishControls();
    this.renderState(this.simulation.state, []);
  }

  public selectPad(padId: string): void {
    const pad = muddyMoatLevel.pads.find((candidate) => candidate.id === padId);
    if (!pad) {
      this.callbacks.onError("That tower pad is not available.");
      return;
    }
    this.handlePadSelection(pad);
  }

  public setPaused(paused: boolean): void {
    this.pausedByPlayer = paused;
    this.callbacks.onPauseChanged(paused);
  }

  public setSpeed(speed: GameSpeed): void {
    this.speed = speed;
  }

  public setEffectSettings(lowEffects: boolean, reducedMotion: boolean): void {
    this.lowEffects = lowEffects;
    this.reducedMotion = reducedMotion;
    this.renderState(this.simulation.state, []);
  }

  private readonly handleVisibility = (): void => {
    if (document.hidden && this.simulation.state.phase === "active") {
      this.setPaused(true);
    }
  };

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    const bounds = this.game.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const scale = Math.min(
      bounds.width / muddyMoatLevel.width,
      bounds.height / muddyMoatLevel.height,
    );
    this.handleWorldPointer(
      {
        x:
          ((event.clientX - bounds.left) * muddyMoatLevel.width) / bounds.width,
        y:
          ((event.clientY - bounds.top) * muddyMoatLevel.height) /
          bounds.height,
      },
      Math.max(38, 24 / scale),
    );
  };

  private handleWorldPointer(world: Point, padHitRadius: number): void {
    const pad = muddyMoatLevel.pads.find(
      (candidate) =>
        Phaser.Math.Distance.Squared(
          world.x,
          world.y,
          candidate.position.x,
          candidate.position.y,
        ) <=
        padHitRadius * padHitRadius,
    );

    if (!pad) {
      this.wheelPadId = null;
      this.selectedTowerInstanceId = null;
      this.callbacks.onTowerSelected(null);
      this.callbacks.onPlacementPreview(null);
      this.publishControls();
      this.renderState(this.simulation.state, []);
      return;
    }
    this.handlePadSelection(pad);
  }

  private handlePadSelection(pad: (typeof muddyMoatLevel.pads)[number]): void {
    const existing = this.simulation.state.towers.find(
      (tower) => tower.padId === pad.id,
    );
    if (existing) {
      this.wheelPadId = null;
      this.selectedTowerInstanceId = existing.id;
      this.callbacks.onTowerSelected(existing);
      this.callbacks.onPlacementPreview(null);
      this.publishControls();
      this.renderState(this.simulation.state, []);
      return;
    }

    if (this.managementDisabled) {
      this.wheelPadId = null;
      this.callbacks.onPlacementPreview(null);
      this.publishControls();
      this.callbacks.onError("Tower management is unavailable right now.");
      this.renderState(this.simulation.state, []);
      return;
    }

    this.selectedTowerInstanceId = null;
    this.callbacks.onTowerSelected(null);
    this.callbacks.onPlacementPreview(null);
    this.wheelPadId = this.wheelPadId === pad.id ? null : pad.id;
    this.publishControls();
    this.renderState(this.simulation.state, []);
  }

  private reconcileControls(state: GameState): void {
    let changed = false;
    if (
      this.selectedTowerInstanceId &&
      !state.towers.some((tower) => tower.id === this.selectedTowerInstanceId)
    ) {
      this.selectedTowerInstanceId = null;
      this.callbacks.onTowerSelected(null);
      changed = true;
    }
    if (
      this.wheelPadId &&
      state.phase !== "preparing" &&
      state.phase !== "active"
    ) {
      this.wheelPadId = null;
      changed = true;
    }
    if (changed) {
      this.publishControls();
    }
  }

  private publishControls(): void {
    this.callbacks.onControlsChanged({
      wheelPadId: this.wheelPadId,
      selectedTowerInstanceId: this.selectedTowerInstanceId,
    });
  }

  private renderState(state: GameState, events: readonly GameEvent[]): void {
    const graphics = this.mapGraphics;
    graphics.clear();
    const motionEnabled = !this.lowEffects && !this.reducedMotion;
    const ambient = motionEnabled ? Math.sin(state.tick * 0.12) : 0;

    graphics.fillStyle(0x172c2a);
    graphics.fillRect(0, 0, muddyMoatLevel.width, muddyMoatLevel.height);
    graphics.fillStyle(0x24483d, 0.34);
    graphics.fillEllipse(210, 28, 430, 108);
    graphics.fillStyle(0x0b1d25, 0.42);
    graphics.fillEllipse(755, 525, 520, 110);
    graphics.fillStyle(0x1c3832, 0.9);
    graphics.fillRect(0, 0, muddyMoatLevel.width, 74);
    graphics.fillStyle(0x10242a, 0.75);
    graphics.fillRect(0, 458, muddyMoatLevel.width, 82);

    for (const [x, y, radius] of DECORATIONS) {
      graphics.fillStyle(0x315341, 0.8);
      graphics.fillCircle(x, y, radius);
      graphics.fillStyle(0x729163, 0.7);
      graphics.fillCircle(
        x - 3 + ambient * Math.min(2, radius / 5),
        y - 4,
        Math.max(3, radius - 5),
      );
      graphics.lineStyle(2, 0xa2bb76, 0.45);
      graphics.lineBetween(x, y + radius, x + ambient * 2, y - radius);
    }

    const pathPoints = muddyMoatLevel.path.map(
      (point) => new Phaser.Math.Vector2(point.x, point.y),
    );
    graphics.lineStyle(70, 0x233d4b, 1);
    graphics.strokePoints(pathPoints, false, false);
    graphics.lineStyle(54, 0x4e6971, 1);
    graphics.strokePoints(pathPoints, false, false);
    graphics.lineStyle(4, 0x78989d, 0.65);
    graphics.strokePoints(pathPoints, false, false);
    this.drawPortalAndTunnel(graphics, state.tick, state.phase === "active");

    const occupiedPads = new Set(state.towers.map((tower) => tower.padId));
    for (const pad of muddyMoatLevel.pads) {
      graphics.fillStyle(occupiedPads.has(pad.id) ? 0x27333a : 0x293f38, 0.95);
      graphics.fillCircle(pad.position.x, pad.position.y, 30);
      graphics.lineStyle(
        3,
        occupiedPads.has(pad.id) ? 0x6f7d7d : 0xa9c880,
        0.9,
      );
      graphics.strokeCircle(pad.position.x, pad.position.y, 30);
      if (!occupiedPads.has(pad.id)) {
        graphics.lineStyle(2, 0xd8efae, 0.35);
        graphics.strokeCircle(pad.position.x, pad.position.y, 20);
        if (
          (state.phase === "preparing" || state.phase === "active") &&
          motionEnabled
        ) {
          graphics.lineStyle(2, 0xd8efae, 0.18);
          graphics.strokeCircle(
            pad.position.x,
            pad.position.y,
            33 + ((state.tick + pad.position.x) % 12) / 3,
          );
        }
        if (this.wheelPadId !== pad.id) {
          graphics.lineStyle(4, 0xeaffce, 0.9);
          graphics.lineBetween(
            pad.position.x - 10,
            pad.position.y,
            pad.position.x + 10,
            pad.position.y,
          );
          graphics.lineBetween(
            pad.position.x,
            pad.position.y - 10,
            pad.position.x,
            pad.position.y + 10,
          );
        }
      }
      if (this.placementPreview?.padId === pad.id) {
        const definition =
          towerDefinitions[
            this.placementPreview.towerId as keyof typeof towerDefinitions
          ];
        graphics.fillStyle(definition.color, 0.18);
        graphics.fillCircle(pad.position.x, pad.position.y, 31);
        graphics.lineStyle(4, definition.color, 0.95);
        graphics.strokeCircle(pad.position.x, pad.position.y, 34);
        graphics.lineStyle(2, 0xffffff, 0.72);
        graphics.strokeCircle(pad.position.x, pad.position.y, 25);
      }
    }

    const attackingTowerIds = new Set(
      events
        .filter((event) => event.type === "tower-attacked")
        .map((event) => event.towerInstanceId),
    );
    const hitEnemyIds = new Set(
      events
        .filter((event) => event.type === "tower-attacked")
        .flatMap((event) => event.affectedInstanceIds),
    );
    for (const tower of state.towers) {
      this.drawTower(
        graphics,
        tower,
        state.tick,
        attackingTowerIds.has(tower.id),
      );
    }
    if (this.placementPreview) {
      const pad = muddyMoatLevel.pads.find(
        (candidate) => candidate.id === this.placementPreview?.padId,
      );
      if (pad) {
        this.drawTowerAvatar(
          graphics,
          this.placementPreview.towerId,
          pad.position.x,
          pad.position.y,
          state.tick,
          false,
          0.58,
        );
      }
    }

    const currentSnapshots = new Map<string, EnemySnapshot>();
    for (const enemy of state.enemies) {
      const position = this.simulation.getEnemyPosition(enemy);
      const definition =
        enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
      currentSnapshots.set(enemy.id, {
        ...position,
        color: definition.color,
        boss: definition.boss,
      });
      this.drawEnemy(
        graphics,
        enemy,
        position,
        state.tick,
        hitEnemyIds.has(enemy.id),
      );
    }

    this.renderEffects(events, state);
    this.enemySnapshots = currentSnapshots;
  }

  private drawPortalAndTunnel(
    graphics: Phaser.GameObjects.Graphics,
    tick: number,
    active: boolean,
  ): void {
    const pulse =
      active && !this.lowEffects && !this.reducedMotion
        ? Math.sin(tick * 0.35) * 4
        : 0;
    graphics.fillStyle(0x0a141c, 0.96);
    graphics.fillEllipse(2, 158, 54, 94);
    graphics.lineStyle(7, 0x7250a4, 0.9);
    graphics.strokeEllipse(2, 158, 48 + pulse, 86 + pulse);
    graphics.lineStyle(3, 0xb58bea, 0.65);
    graphics.strokeEllipse(2, 158, 31 - pulse * 0.3, 64 - pulse * 0.3);
    graphics.fillStyle(0x9a70cc, active ? 0.3 : 0.12);
    graphics.fillEllipse(3, 158, 19 + pulse, 50 + pulse);

    graphics.fillStyle(0x09151a, 0.98);
    graphics.fillRoundedRect(928, 347, 48, 90, 22);
    graphics.lineStyle(6, 0x425866, 1);
    graphics.strokeRoundedRect(928, 347, 48, 90, 22);
    graphics.lineStyle(3, 0x7b9394, 0.55);
    graphics.strokeRoundedRect(937, 356, 30, 72, 16);
    graphics.fillStyle(0xffcb61, 0.8);
    graphics.fillCircle(930, 369, 4);
    graphics.fillCircle(974, 369, 4);
  }

  private drawEnemy(
    graphics: Phaser.GameObjects.Graphics,
    enemy: EnemyState,
    position: Point,
    tick: number,
    wasHit: boolean,
  ): void {
    const definition =
      enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
    const animated = !this.lowEffects && !this.reducedMotion;
    const stride = animated
      ? Math.sin((tick + enemy.variant * 5) * (definition.boss ? 0.3 : 0.65))
      : 0;
    const ahead = this.simulation.getEnemyPosition({
      ...enemy,
      pathDistanceMilli: enemy.pathDistanceMilli + 4_000,
    });
    const facing = ahead.x < position.x ? -1 : 1;
    const directionY = Math.sign(ahead.y - position.y);
    const reactiveHit = wasHit && !this.reducedMotion;
    const hitOffset = reactiveHit ? -facing * 3 : 0;
    const x = position.x + hitOffset;
    const y = position.y + stride * (definition.boss ? 1.5 : 2.4);
    const outline = wasHit ? 0xffffff : enemy.bossPhase ? 0xffd45c : 0x18202a;

    if (enemy.bossPhase) {
      graphics.lineStyle(3, 0xffb454, 0.34);
      graphics.strokeCircle(x, y, 34 + Math.abs(stride) * 2);
      for (let ray = 0; ray < 6; ray += 1) {
        const angle = (Math.PI * 2 * ray) / 6;
        graphics.lineBetween(
          x + Math.cos(angle) * 35,
          y + Math.sin(angle) * 35,
          x + Math.cos(angle) * 40,
          y + Math.sin(angle) * 40,
        );
      }
    }

    if (enemy.enemyId === "basic-goblin") {
      graphics.fillStyle(0x07090d, 0.42);
      graphics.fillEllipse(x + 2, position.y + 16, 30, 8);
      graphics.fillStyle(0x50733e);
      graphics.fillTriangle(x - 8, y - 7, x - 24, y - 16, x - 12, y + 3);
      graphics.fillTriangle(x + 8, y - 7, x + 24, y - 16, x + 12, y + 3);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y, 28, reactiveHit ? 21 : 27);
      graphics.lineStyle(wasHit ? 4 : 3, outline);
      graphics.strokeEllipse(x, y, 28, wasHit ? 21 : 27);
      graphics.fillStyle(0x563a61);
      graphics.fillTriangle(x - 13, y - 8, x + 9, y - 21, x + 14, y - 7);
      graphics.fillStyle(0xe9e7c8);
      graphics.fillCircle(x - 5 + facing, y - 2 + directionY, 3);
      graphics.fillCircle(x + 5 + facing, y - 2 + directionY, 3);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x - 4 + facing * 2, y - 2 + directionY, 1.5);
      graphics.fillCircle(x + 6 + facing * 2, y - 2 + directionY, 1.5);
      graphics.lineStyle(2, 0x31502c);
      graphics.lineBetween(x - 5, y + 7, x + 4, y + 5);
      graphics.fillStyle(0xe4cf8a);
      graphics.fillRect(x - facing * 16 - 4, y + 2, 8, 12);
      graphics.lineStyle(1, 0x634f38);
      graphics.strokeRect(x - facing * 16 - 4, y + 2, 8, 12);
    } else if (enemy.enemyId === "fast-mimic") {
      graphics.fillStyle(0x07090d, 0.42);
      graphics.fillEllipse(x, position.y + 16, 36, 8);
      graphics.lineStyle(4, 0x5a3828);
      graphics.lineBetween(x - 10, y + 10, x - 14 - stride * 3, y + 17);
      graphics.lineBetween(x + 10, y + 10, x + 14 + stride * 3, y + 17);
      graphics.fillStyle(0x9a5b37);
      graphics.fillRoundedRect(x - 17, y - 9, 34, 24, 4);
      graphics.lineStyle(wasHit ? 4 : 3, outline);
      graphics.strokeRoundedRect(x - 17, y - 9, 34, 24, 4);
      graphics.fillStyle(definition.color);
      graphics.fillRoundedRect(x - 19, y - 16 - Math.abs(stride), 38, 12, 5);
      graphics.strokeRoundedRect(x - 19, y - 16 - Math.abs(stride), 38, 12, 5);
      graphics.fillStyle(0x27151a);
      graphics.fillRect(x - 13, y - 5, 26, 13);
      graphics.fillStyle(0xfff0c2);
      for (let tooth = -10; tooth <= 10; tooth += 5) {
        graphics.fillTriangle(
          x + tooth,
          y - 5,
          x + tooth + 4,
          y - 5,
          x + tooth + 2,
          y,
        );
        graphics.fillTriangle(
          x + tooth,
          y + 8,
          x + tooth + 4,
          y + 8,
          x + tooth + 2,
          y + 3,
        );
      }
      graphics.fillStyle(0xffdf69);
      graphics.fillRect(x - 3, y + 8, 6, 7);
      graphics.fillStyle(0xeef7d0);
      graphics.fillCircle(x - 7 + facing, y - 11, 2.5);
      graphics.fillCircle(x + 7 + facing, y - 11, 2.5);
    } else if (enemy.enemyId === "tax-troll") {
      graphics.fillStyle(0x07090d, 0.45);
      graphics.fillEllipse(x + 2, position.y + 21, 48, 10);
      graphics.fillStyle(0x4c6575);
      graphics.fillEllipse(x, y + 3, reactiveHit ? 39 : 44, 38);
      graphics.lineStyle(wasHit ? 5 : 4, outline);
      graphics.strokeEllipse(x, y + 3, wasHit ? 39 : 44, 38);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 8, 30, 24);
      graphics.fillStyle(0xc9d5d5);
      graphics.fillTriangle(x - 8, y - 17, x - 19, y - 28, x - 17, y - 10);
      graphics.fillTriangle(x + 8, y - 17, x + 19, y - 28, x + 17, y - 10);
      graphics.fillStyle(0xaec1c8);
      graphics.fillRect(x - 18, y - 1, 36, 7);
      graphics.lineStyle(2, 0x334452);
      graphics.strokeRect(x - 18, y - 1, 36, 7);
      graphics.fillStyle(0xf4f0d2);
      graphics.fillCircle(x - 6 + facing, y - 9 + directionY, 3);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x - 5 + facing * 2, y - 9 + directionY, 1.5);
      graphics.lineStyle(2, 0x273844);
      graphics.strokeRect(x + 3, y - 13, 8, 8);
      graphics.lineBetween(x - 2, y - 9, x + 3, y - 9);
      graphics.fillStyle(0xe6ddba);
      graphics.fillRoundedRect(x + facing * 18 - 7, y + 2, 14, 19, 2);
      graphics.lineStyle(2, 0x695a49);
      graphics.strokeRoundedRect(x + facing * 18 - 7, y + 2, 14, 19, 2);
      graphics.lineBetween(
        x + facing * 18 - 4,
        y + 8,
        x + facing * 18 + 4,
        y + 8,
      );
      graphics.lineBetween(
        x + facing * 18 - 4,
        y + 13,
        x + facing * 18 + 2,
        y + 13,
      );
    } else {
      graphics.fillStyle(0x07090d, 0.5);
      graphics.fillEllipse(x + 3, position.y + 31, 66, 12);
      graphics.fillStyle(enemy.bossPhase ? 0xd65045 : 0x9e493f);
      graphics.fillTriangle(x - 10, y, x - 38, y - 25, x - 30, y + 18);
      graphics.fillTriangle(x + 10, y, x + 38, y - 25, x + 30, y + 18);
      graphics.lineStyle(3, outline);
      graphics.strokeTriangle(x - 10, y, x - 38, y - 25, x - 30, y + 18);
      graphics.strokeTriangle(x + 10, y, x + 38, y - 25, x + 30, y + 18);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y + 3, reactiveHit ? 42 : 48, 50);
      graphics.lineStyle(wasHit ? 6 : 4, outline);
      graphics.strokeEllipse(x, y + 3, wasHit ? 42 : 48, 50);
      graphics.fillStyle(0xf3b89b);
      graphics.fillEllipse(x + facing * 14, y - 7, 28, 22);
      graphics.fillStyle(0xffe2bf);
      graphics.fillTriangle(x - 12, y - 19, x - 23, y - 36, x - 3, y - 25);
      graphics.fillTriangle(x + 12, y - 19, x + 23, y - 36, x + 3, y - 25);
      graphics.fillStyle(0xfff5c9);
      graphics.fillCircle(x + facing * 10, y - 10 + directionY, 3.5);
      graphics.fillStyle(0x2b1720);
      graphics.fillCircle(x + facing * 12, y - 10 + directionY, 1.8);
      graphics.lineStyle(3, 0x6f302f);
      graphics.lineBetween(x + facing * 15, y - 1, x + facing * 27, y + 2);
      graphics.fillStyle(0xf7e5b1);
      graphics.fillRoundedRect(x - 8, y + 7, 16, 17, 2);
      graphics.fillStyle(0x7d3150);
      graphics.fillTriangle(x - 4, y + 9, x + 4, y + 9, x, y + 20);
      graphics.lineStyle(4, definition.color);
      graphics.lineBetween(
        x - facing * 18,
        y + 14,
        x - facing * 33,
        y + 25 + stride * 2,
      );
    }

    if (enemy.slowUntilTick > tick) {
      graphics.lineStyle(2, 0x7de8ff, 0.85);
      graphics.strokeCircle(x, y, definition.boss ? 33 : 23);
      graphics.fillStyle(0x7de8ff, 0.9);
      graphics.fillTriangle(x, y - 30, x - 5, y - 23, x + 5, y - 23);
      graphics.fillTriangle(x, y - 18, x - 5, y - 25, x + 5, y - 25);
    }

    const radius = definition.boss
      ? 29
      : enemy.enemyId === "tax-troll"
        ? 22
        : 18;
    const barWidth = definition.boss
      ? 66
      : enemy.enemyId === "tax-troll"
        ? 44
        : 36;
    graphics.fillStyle(0x1a1118, 0.95);
    graphics.fillRoundedRect(x - barWidth / 2, y - radius - 12, barWidth, 6, 3);
    const phaseMaxHealth =
      definition.boss && enemy.bossPhase
        ? Math.max(1, Math.floor(enemy.maxHealth / 2))
        : enemy.maxHealth;
    graphics.fillStyle(enemy.bossPhase ? 0xffb454 : 0x7ee081);
    graphics.fillRoundedRect(
      x - barWidth / 2,
      y - radius - 12,
      Math.max(
        2,
        Math.round(
          (barWidth * Math.min(enemy.health, phaseMaxHealth)) / phaseMaxHealth,
        ),
      ),
      6,
      3,
    );
  }

  private drawTower(
    graphics: Phaser.GameObjects.Graphics,
    tower: TowerState,
    tick: number,
    attacking: boolean,
  ): void {
    const pad = muddyMoatLevel.pads.find(
      (candidate) => candidate.id === tower.padId,
    );
    if (!pad) {
      return;
    }

    const definition =
      towerDefinitions[tower.towerId as keyof typeof towerDefinitions];
    const selected = tower.id === this.selectedTowerInstanceId;
    const animated = !this.lowEffects && !this.reducedMotion;
    const towerVariant =
      Number.parseInt(tower.id.replace("tower-", ""), 10) || 0;
    const idle = animated ? Math.sin((tick + towerVariant) * 0.22) : 0;
    const reactiveAttack = attacking && !this.reducedMotion;
    const x = pad.position.x;
    const y = pad.position.y + idle;
    if (selected) {
      const range = definition.levels[tower.level - 1]?.range ?? 0;
      graphics.fillStyle(definition.color, 0.08);
      graphics.fillCircle(pad.position.x, pad.position.y, range);
      graphics.lineStyle(2, definition.color, 0.35);
      graphics.strokeCircle(pad.position.x, pad.position.y, range);
    }

    if (selected) {
      const pulse = animated ? Math.sin(tick * 0.35) * 2 : 0;
      graphics.lineStyle(3, 0xffffff, 0.78);
      graphics.strokeCircle(x, pad.position.y, 31 + pulse);
      graphics.fillStyle(0xffffff, 0.85);
      graphics.fillTriangle(
        x,
        pad.position.y - 37,
        x - 5,
        pad.position.y - 29,
        x + 5,
        pad.position.y - 29,
      );
    }
    this.drawTowerAvatar(
      graphics,
      tower.towerId,
      x,
      y,
      tick,
      reactiveAttack,
      1,
    );

    for (let level = 0; level < tower.level; level += 1) {
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(
        pad.position.x - 7 + level * 7,
        pad.position.y + 28,
        2,
      );
    }
  }

  private drawTowerAvatar(
    graphics: Phaser.GameObjects.Graphics,
    towerId: string,
    x: number,
    y: number,
    tick: number,
    attacking: boolean,
    alpha: number,
  ): void {
    const definition =
      towerDefinitions[towerId as keyof typeof towerDefinitions];
    const animated = !this.lowEffects && !this.reducedMotion;
    const action = attacking && !this.reducedMotion ? 1 : 0;
    const breathe = animated ? Math.sin(tick * 0.22) : 0;

    graphics.fillStyle(0x0b1017, 0.55 * alpha);
    graphics.fillEllipse(x + 2, y + 21, 48, 10);

    if (towerId === "fork-knight") {
      const thrust = action * 10;
      graphics.fillStyle(0x6d3852, alpha);
      graphics.fillTriangle(x - 13, y - 2, x - 17, y + 21, x + 8, y + 18);
      graphics.fillStyle(0x657783, alpha);
      graphics.fillRoundedRect(x - 12, y - 6, 24, 24, 7);
      graphics.lineStyle(3, 0x252d38, alpha);
      graphics.strokeRoundedRect(x - 12, y - 6, 24, 24, 7);
      graphics.fillStyle(0xcbd6d8, alpha);
      graphics.fillRoundedRect(x - 11, y - 22, 22, 20, 7);
      graphics.fillTriangle(x - 8, y - 20, x, y - 31, x + 8, y - 20);
      graphics.lineStyle(3, 0x303943, alpha);
      graphics.strokeRoundedRect(x - 11, y - 22, 22, 20, 7);
      graphics.fillRect(x - 10, y - 12, 20, 4);
      graphics.fillStyle(0xffefbd, alpha);
      graphics.fillCircle(x + 5, y - 10, 2);
      graphics.fillStyle(0x8f4d62, alpha);
      graphics.fillCircle(x - 13, y + 7, 9);
      graphics.lineStyle(2, 0xf3d58a, alpha);
      graphics.strokeCircle(x - 13, y + 7, 9);
      graphics.lineStyle(4, 0xe9d7a4, alpha);
      graphics.lineBetween(x + 8, y + 14, x + 18 + thrust, y - 18);
      graphics.lineStyle(2, 0xe9d7a4, alpha);
      for (let tine = -5; tine <= 5; tine += 5) {
        graphics.lineBetween(
          x + 18 + thrust + tine,
          y - 18,
          x + 18 + thrust + tine,
          y - 27,
        );
      }
      graphics.lineBetween(x + 13 + thrust, y - 18, x + 23 + thrust, y - 18);
    } else if (towerId === "discount-wizard") {
      const cast = action * 8;
      graphics.fillStyle(0x4d3271, alpha);
      graphics.fillTriangle(x, y - 29, x - 20, y + 20, x + 20, y + 20);
      graphics.fillStyle(0x764ca0, alpha);
      graphics.fillTriangle(x - 17, y - 17, x + 1, y - 36, x + 17, y - 15);
      graphics.fillStyle(0xf0c2a7, alpha);
      graphics.fillCircle(x, y - 8, 9);
      graphics.fillStyle(0xe6e1d5, alpha);
      graphics.fillTriangle(x - 7, y - 2, x + 8, y - 2, x + 2, y + 12);
      graphics.fillStyle(0xffe989, alpha);
      graphics.fillCircle(x - 3, y - 10, 2);
      graphics.fillCircle(x + 4, y - 10, 2);
      graphics.lineStyle(4, 0x8b603d, alpha);
      graphics.lineBetween(x + 10, y + 15, x + 21 + cast, y - 17 - cast);
      graphics.fillStyle(action ? 0xffffff : definition.color, alpha);
      graphics.fillCircle(x + 21 + cast, y - 17 - cast, action ? 8 : 5);
      graphics.lineStyle(2, 0xffef9c, 0.8 * alpha);
      graphics.strokeCircle(x + 21 + cast, y - 17 - cast, action ? 12 : 7);
    } else {
      const strum = action * 7;
      graphics.fillStyle(0x325f56, alpha);
      graphics.fillRoundedRect(x - 15, y - 2, 30, 23, 8);
      graphics.fillStyle(0xefb88f, alpha);
      graphics.fillCircle(x, y - 13, 10);
      graphics.fillStyle(0x203b38, alpha);
      graphics.fillTriangle(
        x - 9,
        y - 20,
        x,
        y - 31 - breathe * 2,
        x + 9,
        y - 20,
      );
      graphics.fillStyle(0xf1dc93, alpha);
      graphics.fillCircle(x - 3, y - 14, 2);
      graphics.fillCircle(x + 4, y - 14, 2);
      graphics.lineStyle(5, 0xefb88f, alpha);
      graphics.lineBetween(x - 13, y + 3, x - 21, y + 13);
      graphics.lineBetween(x + 12, y + 3, x + 20 + strum, y - 1);
      graphics.fillStyle(0x8b5533, alpha);
      graphics.fillEllipse(x + 8, y + 9, 22, 25);
      graphics.lineStyle(2, 0xf4dfaa, alpha);
      graphics.strokeEllipse(x + 8, y + 9, 22, 25);
      graphics.fillStyle(0x2c1c19, alpha);
      graphics.fillCircle(x + 8, y + 9, 4);
      graphics.lineStyle(3, 0xe6c778, alpha);
      graphics.lineBetween(x + 1, y + 16, x + 18, y - 7);
      if (action) {
        graphics.lineStyle(2, definition.color, 0.7 * alpha);
        graphics.strokeCircle(x, y, 29);
        graphics.strokeCircle(x, y, 35);
      }
    }
  }

  private renderEffects(events: readonly GameEvent[], state: GameState): void {
    this.effectsGraphics.clear();
    if (state.phase !== "active") {
      this.transientEffects = [];
      return;
    }

    const attacks = events
      .filter((event) => event.type === "tower-attacked")
      .slice(-4);
    for (const attack of attacks) {
      const tower = state.towers.find(
        (candidate) => candidate.id === attack.towerInstanceId,
      );
      const enemy = state.enemies.find(
        (candidate) => candidate.id === attack.targetInstanceId,
      );
      const pad = tower
        ? muddyMoatLevel.pads.find((candidate) => candidate.id === tower.padId)
        : null;
      const target = enemy
        ? this.simulation.getEnemyPosition(enemy)
        : this.enemySnapshots.get(attack.targetInstanceId);
      if (tower && pad && target) {
        const color =
          towerDefinitions[tower.towerId as keyof typeof towerDefinitions]
            .color;
        this.effectsGraphics.lineStyle(
          tower.towerId === "fork-knight" ? 3 : 4,
          color,
          0.85,
        );
        this.effectsGraphics.lineBetween(
          pad.position.x,
          pad.position.y,
          target.x,
          target.y,
        );
      }
    }

    for (const event of events) {
      let effect: TransientEffect | null = null;
      if (event.type === "enemy-spawned") {
        const spawned = state.enemies.find(
          (enemy) => enemy.id === event.instanceId,
        );
        const definition =
          enemyDefinitions[event.enemyId as keyof typeof enemyDefinitions];
        const position = spawned
          ? this.simulation.getEnemyPosition(spawned)
          : muddyMoatLevel.path[0];
        if (position && definition) {
          effect = {
            ...position,
            kind: "spawn",
            color: definition.color,
            startedAtTick: state.tick,
            variant: Number(event.instanceId.replace("enemy-", "")) || 0,
          };
        }
      } else if (
        event.type === "enemy-defeated" ||
        event.type === "enemy-leaked"
      ) {
        const snapshot = this.enemySnapshots.get(event.instanceId);
        if (snapshot) {
          effect = {
            x: snapshot.x,
            y: snapshot.y,
            kind: event.type === "enemy-defeated" ? "defeat" : "leak",
            color: snapshot.color,
            startedAtTick: state.tick,
            variant: Number(event.instanceId.replace("enemy-", "")) || 0,
          };
        }
      } else if (event.type === "boss-phase") {
        const boss = state.enemies.find(
          (enemy) => enemy.id === event.instanceId,
        );
        const position = boss
          ? this.simulation.getEnemyPosition(boss)
          : this.enemySnapshots.get(event.instanceId);
        if (position) {
          effect = {
            x: position.x,
            y: position.y,
            kind: "boss-phase",
            color: 0xffb454,
            startedAtTick: state.tick,
            variant: 0,
          };
        }
      } else if (event.type === "ability-activated") {
        const target = state.enemies.find(
          (enemy) => enemy.id === event.targetInstanceId,
        );
        const position = target
          ? this.simulation.getEnemyPosition(target)
          : this.enemySnapshots.get(event.targetInstanceId);
        if (position) {
          effect = {
            x: position.x,
            y: position.y,
            kind: "ability",
            color: 0xffe89b,
            startedAtTick: state.tick,
            variant: 0,
          };
        }
      }
      if (effect) {
        this.transientEffects.push(effect);
      }
    }
    if (this.transientEffects.length > MAX_TRANSIENT_EFFECTS) {
      this.transientEffects = this.transientEffects.slice(
        -MAX_TRANSIENT_EFFECTS,
      );
    }

    const impact = events.some(
      (event) =>
        event.type === "boss-phase" || event.type === "ability-activated",
    );
    if (impact && !this.lowEffects && !this.reducedMotion) {
      this.cameras.main.shake(220, 0.008);
    }

    if (this.reducedMotion) {
      this.transientEffects = this.transientEffects.filter(
        (effect) => effect.startedAtTick === state.tick,
      );
    }
    const effectLifetime = this.reducedMotion ? 3 : this.lowEffects ? 7 : 13;
    this.transientEffects = this.transientEffects.filter(
      (effect) => state.tick - effect.startedAtTick <= effectLifetime,
    );
    for (const effect of this.transientEffects) {
      const age = state.tick - effect.startedAtTick;
      const progress = this.reducedMotion
        ? 0
        : Math.min(1, age / effectLifetime);
      const alpha = 1 - progress;
      if (effect.kind === "spawn") {
        this.effectsGraphics.lineStyle(3, effect.color, alpha * 0.8);
        this.effectsGraphics.strokeCircle(
          Math.max(4, effect.x),
          effect.y,
          8 + progress * 24,
        );
        this.effectsGraphics.fillStyle(effect.color, alpha * 0.5);
        this.effectsGraphics.fillTriangle(
          Math.max(8, effect.x) + 5 + progress * 12,
          effect.y,
          Math.max(8, effect.x) - 2 + progress * 12,
          effect.y - 5,
          Math.max(8, effect.x) - 2 + progress * 12,
          effect.y + 5,
        );
      } else if (effect.kind === "boss-phase") {
        this.effectsGraphics.lineStyle(6 - progress * 3, 0xffb454, alpha);
        this.effectsGraphics.strokeCircle(
          effect.x,
          effect.y,
          28 + progress * 74,
        );
        this.effectsGraphics.lineStyle(3, 0xfff0a8, alpha * 0.8);
        this.effectsGraphics.strokeCircle(
          effect.x,
          effect.y,
          18 + progress * 48,
        );
      } else if (effect.kind === "ability") {
        this.effectsGraphics.lineStyle(8 - progress * 4, 0xfff1af, alpha);
        this.effectsGraphics.lineBetween(
          effect.x - 24,
          effect.y - 100 + progress * 42,
          effect.x + 5,
          effect.y + 8,
        );
        this.effectsGraphics.lineStyle(3, 0x8b603d, alpha);
        for (let tine = -12; tine <= 12; tine += 12) {
          this.effectsGraphics.lineBetween(
            effect.x - 7 + tine,
            effect.y - 103 + progress * 42,
            effect.x - 2 + tine,
            effect.y - 83 + progress * 42,
          );
        }
        this.effectsGraphics.lineStyle(5, 0xffd45e, alpha);
        this.effectsGraphics.strokeCircle(
          effect.x,
          effect.y,
          18 + progress * 58,
        );
      } else {
        const pieces = this.lowEffects || this.reducedMotion ? 3 : 7;
        for (let spark = 0; spark < pieces; spark += 1) {
          const angle = (Math.PI * 2 * spark) / pieces + effect.variant * 0.37;
          const distance =
            effect.kind === "leak" ? progress * 28 : 5 + progress * 24;
          const sparkX =
            effect.x +
            Math.cos(angle) * distance +
            (effect.kind === "leak" ? progress * 16 : 0);
          const sparkY =
            effect.y +
            Math.sin(angle) * distance +
            (effect.kind === "defeat" ? progress * 8 : -progress * 10);
          this.effectsGraphics.fillStyle(
            spark % 2 === 0 ? effect.color : 0xfff0bd,
            alpha,
          );
          if (effect.kind === "defeat") {
            this.effectsGraphics.fillTriangle(
              sparkX,
              sparkY - 4,
              sparkX - 3,
              sparkY + 3,
              sparkX + 3,
              sparkY + 3,
            );
          } else {
            this.effectsGraphics.fillRect(sparkX - 2, sparkY - 4, 4, 8);
          }
        }
        if (effect.kind === "leak") {
          this.effectsGraphics.lineStyle(3, 0xffb18e, alpha);
          this.effectsGraphics.strokeCircle(
            effect.x,
            effect.y,
            9 + progress * 9,
          );
        }
      }
    }
  }
}

export const Battlefield = forwardRef<BattlefieldHandle, BattlefieldProps>(
  function Battlefield(
    {
      simulation,
      placementPreview,
      managementDisabled,
      gameSpeed,
      lowEffects,
      reducedMotion,
      onState,
      onTowerSelected,
      onPlacementPreview,
      onPauseChanged,
      onError,
    },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<BattleScene | null>(null);
    const padButtons = useRef(new Map<string, HTMLButtonElement>());
    const overlayPrimaryAction = useRef<HTMLButtonElement>(null);
    const previousControlPadId = useRef<string | null>(null);
    const [controls, setControls] =
      useState<CanvasControlState>(EMPTY_CONTROLS);
    const [canvasFrame, setCanvasFrame] = useState<CanvasFrame | null>(null);
    const [pendingTowerAction, setPendingTowerAction] = useState<
      "upgrade" | "sell" | null
    >(null);
    const callbacks = useRef({
      onState,
      onTowerSelected,
      onPlacementPreview,
      onPauseChanged,
      onError,
    });
    callbacks.current = {
      onState,
      onTowerSelected,
      onPlacementPreview,
      onPauseChanged,
      onError,
    };

    useImperativeHandle(ref, () => ({
      dispatch(command) {
        return scene.current?.dispatch(command) ?? false;
      },
      confirmPlacement(preview) {
        return scene.current?.confirmPlacement(preview) ?? false;
      },
      setPaused(paused) {
        scene.current?.setPaused(paused);
      },
      setSpeed(speed) {
        scene.current?.setSpeed(speed);
      },
    }));

    useEffect(() => {
      scene.current?.setSpeed(gameSpeed);
    }, [gameSpeed]);

    useEffect(() => {
      scene.current?.setPlacementPreview(placementPreview);
    }, [placementPreview]);

    useEffect(() => {
      scene.current?.setManagementDisabled(managementDisabled);
    }, [managementDisabled]);

    useEffect(() => {
      scene.current?.setEffectSettings(lowEffects, reducedMotion);
    }, [lowEffects, reducedMotion]);

    useEffect(() => {
      const container = host.current;
      if (!container) {
        return;
      }

      const battleScene = new BattleScene(
        simulation,
        {
          onState: (state, events) => callbacks.current.onState(state, events),
          onTowerSelected: (tower) => callbacks.current.onTowerSelected(tower),
          onPlacementPreview: (preview) =>
            callbacks.current.onPlacementPreview(preview),
          onPauseChanged: (paused) => callbacks.current.onPauseChanged(paused),
          onError: (message) => callbacks.current.onError(message),
          onControlsChanged: setControls,
        },
        lowEffects,
        reducedMotion,
        managementDisabled,
        placementPreview,
      );
      battleScene.setSpeed(gameSpeed);
      let game: Phaser.Game | null = null;
      let canvasObserver: ResizeObserver | null = null;
      const updateCanvasFrame = () => {
        const canvas = game?.canvas;
        if (!canvas) {
          return;
        }
        const containerBounds = container.getBoundingClientRect();
        const canvasBounds = canvas.getBoundingClientRect();
        setCanvasFrame({
          left: canvasBounds.left - containerBounds.left,
          top: canvasBounds.top - containerBounds.top,
          width: canvasBounds.width,
          height: canvasBounds.height,
        });
      };
      const startFrame = window.requestAnimationFrame(() => {
        if (!container.isConnected) {
          return;
        }
        container.replaceChildren();
        scene.current = battleScene;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: container,
          width: muddyMoatLevel.width,
          height: muddyMoatLevel.height,
          backgroundColor: "#172c2a",
          render: {
            antialias: true,
            powerPreference: "high-performance",
          },
          scale: {
            mode: Phaser.Scale.FIT,
            autoCenter: Phaser.Scale.CENTER_BOTH,
          },
          scene: [battleScene],
        });
        canvasObserver = new ResizeObserver(updateCanvasFrame);
        canvasObserver.observe(container);
        canvasObserver.observe(game.canvas);
        window.requestAnimationFrame(updateCanvasFrame);
      });

      return () => {
        window.cancelAnimationFrame(startFrame);
        canvasObserver?.disconnect();
        scene.current = null;
        game?.destroy(true);
        container.replaceChildren();
      };
    }, [simulation]);

    const wheelPad = controls.wheelPadId
      ? muddyMoatLevel.pads.find((pad) => pad.id === controls.wheelPadId)
      : null;
    const selectedTower = controls.selectedTowerInstanceId
      ? simulation.state.towers.find(
          (tower) => tower.id === controls.selectedTowerInstanceId,
        )
      : null;
    const selectedPad = selectedTower
      ? muddyMoatLevel.pads.find((pad) => pad.id === selectedTower.padId)
      : null;
    const selectedDefinition = selectedTower
      ? towerDefinitions[selectedTower.towerId as keyof typeof towerDefinitions]
      : null;
    const selectedLevel =
      selectedTower && selectedDefinition
        ? selectedDefinition.levels[selectedTower.level - 1]
        : null;
    const wheelOptions = Object.values(towerDefinitions);
    const previewPad = placementPreview
      ? muddyMoatLevel.pads.find((pad) => pad.id === placementPreview.padId)
      : null;
    const previewDefinition = placementPreview
      ? towerDefinitions[
          placementPreview.towerId as keyof typeof towerDefinitions
        ]
      : null;
    const wheelPositions =
      wheelPad && canvasFrame
        ? controlRowPositions(
            wheelPad.position,
            canvasFrame,
            wheelOptions.length,
            WHEEL_BUTTON_SIZE,
          )
        : [];
    const actionPositions =
      selectedPad && canvasFrame
        ? controlRowPositions(
            selectedPad.position,
            canvasFrame,
            2,
            ACTION_BUTTON_SIZE,
          )
        : [];
    const placementPositions =
      previewPad && canvasFrame
        ? controlRowPositions(
            previewPad.position,
            canvasFrame,
            2,
            ACTION_BUTTON_SIZE,
          )
        : [];
    const upgradeCost = selectedLevel?.upgradeCost ?? null;
    const upgradeDisabled =
      managementDisabled ||
      upgradeCost === null ||
      simulation.state.gold < upgradeCost;
    const sellDisabled =
      managementDisabled || simulation.state.phase !== "preparing";
    const sellValue = selectedTower
      ? Math.floor(selectedTower.investedGold * 0.7)
      : 0;
    const towersByPad = new Map(
      simulation.state.towers.map((tower) => [tower.padId, tower]),
    );
    const canvasControlOpen = Boolean(
      wheelPad || selectedTower || placementPreview,
    );

    useEffect(() => {
      setPendingTowerAction(null);
    }, [
      controls.selectedTowerInstanceId,
      managementDisabled,
      simulation.state.phase,
    ]);

    useEffect(() => {
      const activePadId =
        placementPreview?.padId ?? wheelPad?.id ?? selectedPad?.id ?? null;
      if (activePadId) {
        previousControlPadId.current = activePadId;
        overlayPrimaryAction.current?.focus();
        return;
      }

      const padId = previousControlPadId.current;
      previousControlPadId.current = null;
      if (padId) {
        window.requestAnimationFrame(() =>
          padButtons.current.get(padId)?.focus(),
        );
      }
    }, [
      controls.selectedTowerInstanceId,
      controls.wheelPadId,
      placementPreview?.padId,
      selectedPad?.id,
      wheelPad?.id,
    ]);

    return (
      <div className="battlefield" aria-label="The Muddy Moat battlefield">
        <div className="battlefield-canvas" ref={host} />
        {canvasFrame && (
          <div
            className="battlefield-control-layer battlefield-pad-layer"
            role="group"
            aria-label="Tower pads"
          >
            {muddyMoatLevel.pads.map((pad) => {
              const tower = towersByPad.get(pad.id);
              const definition = tower
                ? towerDefinitions[
                    tower.towerId as keyof typeof towerDefinitions
                  ]
                : null;
              return (
                <button
                  key={pad.id}
                  ref={(button) => {
                    if (button) {
                      padButtons.current.set(pad.id, button);
                    } else {
                      padButtons.current.delete(pad.id);
                    }
                  }}
                  className="battlefield-pad-button"
                  style={controlStyle(
                    canvasFrame,
                    worldToCanvasPosition(pad.position, canvasFrame),
                  )}
                  disabled={!tower && managementDisabled}
                  tabIndex={canvasControlOpen ? -1 : 0}
                  aria-pressed={
                    controls.wheelPadId === pad.id ||
                    controls.selectedTowerInstanceId === tower?.id
                  }
                  aria-label={
                    tower && definition
                      ? `Inspect ${definition.shortName} at ${padName(pad.id)}`
                      : `Open hero wheel at ${padName(pad.id)}`
                  }
                  onClick={() => scene.current?.selectPad(pad.id)}
                />
              );
            })}
          </div>
        )}
        {canvasFrame && wheelPad && (
          <div
            className="battlefield-control-layer"
            role="group"
            aria-label="Hero wheel"
          >
            {wheelOptions.map((definition, index) => {
              const position = wheelPositions[index];
              return position ? (
                <button
                  key={definition.id}
                  ref={index === 0 ? overlayPrimaryAction : undefined}
                  className={`tower-wheel-button tower-${definition.id}`}
                  style={controlStyle(canvasFrame, position)}
                  aria-label={`Preview ${definition.shortName} for ${definition.cost} gold`}
                  onClick={() =>
                    scene.current?.chooseWheelOption(definition.id)
                  }
                >
                  <strong aria-hidden="true">
                    {definition.shortName
                      .split(/\s+/)
                      .map((word) => word[0])
                      .join("")}
                  </strong>
                  <small aria-hidden="true">{definition.cost}g</small>
                </button>
              ) : null;
            })}
          </div>
        )}
        {canvasFrame && placementPreview && previewPad && previewDefinition && (
          <div
            className="battlefield-control-layer"
            role="group"
            aria-label={`${previewDefinition.shortName} placement`}
          >
            <span
              className="battlefield-context-label"
              style={controlStyle(
                canvasFrame,
                contextLabelPosition(
                  previewPad.position,
                  placementPositions,
                  canvasFrame,
                ),
              )}
            >
              {previewDefinition.shortName} · {previewDefinition.cost}g
              {simulation.state.gold < previewDefinition.cost
                ? ` · need ${previewDefinition.cost - simulation.state.gold}g`
                : ""}
            </span>
            <button
              ref={overlayPrimaryAction}
              className="tower-action-button placement-cancel-button"
              style={controlStyle(canvasFrame, placementPositions[0]!)}
              aria-label={`Cancel ${previewDefinition.shortName} placement`}
              onClick={() => callbacks.current.onPlacementPreview(null)}
            >
              <strong aria-hidden="true">×</strong>
            </button>
            <button
              className="tower-action-button placement-confirm-button"
              style={controlStyle(canvasFrame, placementPositions[1]!)}
              disabled={
                managementDisabled ||
                simulation.state.gold < previewDefinition.cost
              }
              aria-label={`Confirm ${previewDefinition.shortName} placement for ${previewDefinition.cost} gold`}
              onClick={() => {
                if (scene.current?.confirmPlacement(placementPreview)) {
                  callbacks.current.onPlacementPreview(null);
                  callbacks.current.onError(
                    `${previewDefinition.shortName} deployed.`,
                  );
                }
              }}
            >
              <strong aria-hidden="true">✓</strong>
              <small aria-hidden="true">{previewDefinition.cost}g</small>
            </button>
          </div>
        )}
        {canvasFrame &&
          selectedTower &&
          selectedDefinition &&
          selectedLevel &&
          selectedPad && (
            <div
              className="battlefield-control-layer"
              role="group"
              aria-label={`${selectedDefinition.shortName} actions`}
            >
              <span
                className="battlefield-context-label"
                style={controlStyle(
                  canvasFrame,
                  contextLabelPosition(
                    selectedPad.position,
                    actionPositions,
                    canvasFrame,
                  ),
                )}
              >
                {pendingTowerAction === "upgrade" && upgradeCost !== null
                  ? `Upgrade to rank ${selectedTower.level + 1} for ${upgradeCost}g?`
                  : pendingTowerAction === "sell"
                    ? `Sell ${selectedDefinition.shortName} for ${sellValue}g?`
                    : `${selectedDefinition.shortName} · rank ${selectedTower.level}`}
              </span>
              <button
                ref={overlayPrimaryAction}
                className="tower-action-button tower-upgrade-button"
                style={controlStyle(canvasFrame, actionPositions[0]!)}
                disabled={
                  pendingTowerAction === "sell" ? false : upgradeDisabled
                }
                aria-label={
                  pendingTowerAction === "sell"
                    ? "Cancel tower sale"
                    : pendingTowerAction === "upgrade" && upgradeCost !== null
                      ? `Confirm ${selectedDefinition.shortName} upgrade for ${upgradeCost} gold`
                      : upgradeCost === null
                        ? `${selectedDefinition.shortName} is at maximum rank`
                        : `Upgrade ${selectedDefinition.shortName} for ${upgradeCost} gold`
                }
                onClick={() => {
                  if (pendingTowerAction === "sell") {
                    setPendingTowerAction(null);
                    return;
                  }
                  if (pendingTowerAction !== "upgrade") {
                    setPendingTowerAction("upgrade");
                    return;
                  }
                  if (
                    scene.current?.dispatch({
                      type: "upgrade-tower",
                      instanceId: selectedTower.id,
                    })
                  ) {
                    setPendingTowerAction(null);
                  }
                }}
              >
                <strong aria-hidden="true">
                  {pendingTowerAction === "sell"
                    ? "×"
                    : pendingTowerAction === "upgrade"
                      ? "✓"
                      : "+"}
                </strong>
                <small aria-hidden="true">
                  {pendingTowerAction === "sell"
                    ? "NO"
                    : upgradeCost === null
                      ? "MAX"
                      : `${upgradeCost}g`}
                </small>
              </button>
              <button
                className="tower-action-button tower-sell-button"
                style={controlStyle(canvasFrame, actionPositions[1]!)}
                disabled={
                  pendingTowerAction === "upgrade" ? false : sellDisabled
                }
                aria-label={
                  pendingTowerAction === "upgrade"
                    ? "Cancel tower upgrade"
                    : pendingTowerAction === "sell"
                      ? `Confirm sale of ${selectedDefinition.shortName} for ${sellValue} gold`
                      : `Sell ${selectedDefinition.shortName} for ${sellValue} gold`
                }
                onClick={() => {
                  if (pendingTowerAction === "upgrade") {
                    setPendingTowerAction(null);
                    return;
                  }
                  if (pendingTowerAction !== "sell") {
                    setPendingTowerAction("sell");
                    return;
                  }
                  if (
                    scene.current?.dispatch({
                      type: "sell-tower",
                      instanceId: selectedTower.id,
                    })
                  ) {
                    setPendingTowerAction(null);
                  }
                }}
              >
                <strong aria-hidden="true">
                  {pendingTowerAction === "upgrade"
                    ? "×"
                    : pendingTowerAction === "sell"
                      ? "✓"
                      : "−"}
                </strong>
                <small aria-hidden="true">
                  {pendingTowerAction === "upgrade" ? "NO" : `${sellValue}g`}
                </small>
              </button>
            </div>
          )}
      </div>
    );
  },
);
