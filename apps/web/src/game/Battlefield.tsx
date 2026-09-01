import {
  enemyDefinitions,
  muddyMoatLevel,
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
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface BattlefieldHandle {
  dispatch(command: GameCommand): void;
  setPaused(paused: boolean): void;
  setSpeed(speed: GameSpeed): void;
}

interface BattlefieldProps {
  readonly simulation: Simulation;
  readonly selectedTowerId: string;
  readonly gameSpeed: GameSpeed;
  readonly lowEffects: boolean;
  readonly reducedMotion: boolean;
  readonly onState: (state: GameState, events: readonly GameEvent[]) => void;
  readonly onTowerSelected: (tower: TowerState | null) => void;
  readonly onPauseChanged: (paused: boolean) => void;
  readonly onError: (message: string) => void;
}

interface SceneCallbacks {
  readonly selectedTowerId: () => string;
  readonly onState: BattlefieldProps["onState"];
  readonly onTowerSelected: BattlefieldProps["onTowerSelected"];
  readonly onPauseChanged: BattlefieldProps["onPauseChanged"];
  readonly onError: BattlefieldProps["onError"];
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

interface EnemySnapshot extends Point {
  readonly color: number;
  readonly boss: boolean;
}

interface TransientEffect extends Point {
  readonly kind: "spawn" | "defeat" | "leak" | "boss-phase";
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
  private enemySnapshots = new Map<string, EnemySnapshot>();
  private transientEffects: TransientEffect[] = [];

  public constructor(
    private readonly simulation: Simulation,
    private readonly callbacks: SceneCallbacks,
    private readonly lowEffects: boolean,
    private readonly reducedMotion: boolean,
  ) {
    super({ key: "battle" });
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
    this.renderState(this.simulation.state, []);
    this.callbacks.onState(this.simulation.state, []);
  }

  public override update(_time: number, delta: number): void {
    if (this.pausedByPlayer || this.simulation.state.phase !== "active") {
      return;
    }

    this.accumulator += Math.min(delta, 250) * this.speed;
    while (this.accumulator >= 50) {
      const result = this.simulation.step();
      this.accumulator -= 50;
      this.renderState(result.state, result.events);
      this.callbacks.onState(result.state, result.events);
      if (result.state.phase !== "active") {
        this.accumulator = 0;
        break;
      }
    }
  }

  public dispatch(command: GameCommand): void {
    try {
      const result = this.simulation.dispatch(command);
      this.renderState(result.state, result.events);
      this.callbacks.onState(result.state, result.events);
    } catch (error) {
      this.callbacks.onError(
        error instanceof Error ? error.message : "That heroic act failed.",
      );
    }
  }

  public setPaused(paused: boolean): void {
    this.pausedByPlayer = paused;
    this.callbacks.onPauseChanged(paused);
  }

  public setSpeed(speed: GameSpeed): void {
    this.speed = speed;
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
    this.handleWorldPointer({
      x: ((event.clientX - bounds.left) * muddyMoatLevel.width) / bounds.width,
      y: ((event.clientY - bounds.top) * muddyMoatLevel.height) / bounds.height,
    });
  };

  private handleWorldPointer(world: Point): void {
    const pad = muddyMoatLevel.pads.find(
      (candidate) =>
        Phaser.Math.Distance.Squared(
          world.x,
          world.y,
          candidate.position.x,
          candidate.position.y,
        ) <=
        38 * 38,
    );

    if (!pad) {
      this.selectedTowerInstanceId = null;
      this.callbacks.onTowerSelected(null);
      this.renderState(this.simulation.state, []);
      return;
    }

    const existing = this.simulation.state.towers.find(
      (tower) => tower.padId === pad.id,
    );
    if (existing) {
      this.selectedTowerInstanceId = existing.id;
      this.callbacks.onTowerSelected(existing);
      this.renderState(this.simulation.state, []);
      return;
    }

    this.selectedTowerInstanceId = null;
    this.callbacks.onTowerSelected(null);
    this.dispatch({
      type: "place-tower",
      towerId: this.callbacks.selectedTowerId(),
      padId: pad.id,
    });
    const placed = this.simulation.state.towers.find(
      (tower) => tower.padId === pad.id,
    );
    if (placed) {
      this.selectedTowerInstanceId = placed.id;
      this.callbacks.onTowerSelected(placed);
      this.renderState(this.simulation.state, []);
    }
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
    graphics.fillStyle(enemy.bossPhase ? 0xffb454 : 0x7ee081);
    graphics.fillRoundedRect(
      x - barWidth / 2,
      y - radius - 12,
      Math.max(2, Math.round((barWidth * enemy.health) / enemy.maxHealth)),
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

    graphics.fillStyle(0x11141d, 0.7);
    graphics.fillEllipse(x + 3, pad.position.y + 20, 48, 11);
    graphics.fillStyle(definition.color);
    graphics.fillCircle(x, y, reactiveAttack ? 19 : 21);
    graphics.lineStyle(selected ? 5 : 3, selected ? 0xffffff : 0x202131);
    graphics.strokeCircle(x, y, reactiveAttack ? 19 : 21);

    if (tower.towerId === "fork-knight") {
      graphics.fillStyle(0xc4d1d3);
      graphics.fillRoundedRect(x - 10, y - 14, 20, 17, 5);
      graphics.fillStyle(0x27303b);
      graphics.fillRect(x - 10, y - 4, 20, 4);
      graphics.fillStyle(0xffefbd);
      graphics.fillCircle(x + 4, y - 7, 2);
      graphics.fillStyle(0x7d4861);
      graphics.fillCircle(x - 8, y + 9, 7);
      graphics.lineStyle(3, 0xf8e6ad);
      graphics.lineBetween(
        x + 11,
        y + 13,
        x + 13 + (reactiveAttack ? 8 : 0),
        y - 14,
      );
      graphics.lineBetween(
        x + 8 + (reactiveAttack ? 8 : 0),
        y - 14,
        x + 8 + (reactiveAttack ? 8 : 0),
        y - 7,
      );
      graphics.lineBetween(
        x + 13 + (reactiveAttack ? 8 : 0),
        y - 15,
        x + 13 + (reactiveAttack ? 8 : 0),
        y - 7,
      );
      graphics.lineBetween(
        x + 18 + (reactiveAttack ? 8 : 0),
        y - 14,
        x + 18 + (reactiveAttack ? 8 : 0),
        y - 7,
      );
    } else if (tower.towerId === "discount-wizard") {
      graphics.fillStyle(0x342349);
      graphics.fillTriangle(x, y - 22, x - 15, y + 4, x + 15, y + 4);
      graphics.fillStyle(0xf0c2a7);
      graphics.fillCircle(x, y + 2, 8);
      graphics.fillStyle(0x342349);
      graphics.fillEllipse(x, y + 13, 27, 18);
      graphics.fillStyle(0xffe989);
      graphics.fillCircle(x + 3, y, 2);
      graphics.lineStyle(3, 0x8b603d);
      graphics.lineBetween(
        x + 9,
        y + 12,
        x + 18,
        y - 9 - (reactiveAttack ? 7 : 0),
      );
      graphics.fillStyle(reactiveAttack ? 0xffffff : 0xffe989);
      graphics.fillCircle(
        x + 18,
        y - 9 - (reactiveAttack ? 7 : 0),
        reactiveAttack ? 6 : 4,
      );
    } else {
      graphics.fillStyle(0xefb88f);
      graphics.fillCircle(x, y - 9, 8);
      graphics.fillStyle(0x325f56);
      graphics.fillEllipse(x, y + 9, 29, 22);
      graphics.fillStyle(0xf1dc93);
      graphics.fillCircle(x + 2, y - 10, 2);
      graphics.lineStyle(4, 0x6f432f);
      graphics.strokeCircle(x + 8, y + 8, 10);
      graphics.lineBetween(
        x + 1,
        y + 15,
        x + 15 + (reactiveAttack ? 6 : 0),
        y + 1 - (reactiveAttack ? 5 : 0),
      );
      graphics.lineStyle(2, 0xf4dfaa);
      graphics.lineBetween(x + 4, y + 5, x + 12, y + 12);
      graphics.lineBetween(x + 5, y + 13, x + 12, y + 5);
    }

    for (let level = 0; level < tower.level; level += 1) {
      graphics.fillStyle(0xffffff);
      graphics.fillCircle(
        pad.position.x - 7 + level * 7,
        pad.position.y + 28,
        2,
      );
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

    const bossPhase = events.some((event) => event.type === "boss-phase");
    if (bossPhase && !this.lowEffects && !this.reducedMotion) {
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
      selectedTowerId,
      gameSpeed,
      lowEffects,
      reducedMotion,
      onState,
      onTowerSelected,
      onPauseChanged,
      onError,
    },
    ref,
  ) {
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<BattleScene | null>(null);
    const callbacks = useRef({
      selectedTowerId,
      onState,
      onTowerSelected,
      onPauseChanged,
      onError,
    });
    callbacks.current = {
      selectedTowerId,
      onState,
      onTowerSelected,
      onPauseChanged,
      onError,
    };

    useImperativeHandle(ref, () => ({
      dispatch(command) {
        scene.current?.dispatch(command);
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
      if (!host.current) {
        return;
      }

      const battleScene = new BattleScene(
        simulation,
        {
          selectedTowerId: () => callbacks.current.selectedTowerId,
          onState: (state, events) => callbacks.current.onState(state, events),
          onTowerSelected: (tower) => callbacks.current.onTowerSelected(tower),
          onPauseChanged: (paused) => callbacks.current.onPauseChanged(paused),
          onError: (message) => callbacks.current.onError(message),
        },
        lowEffects,
        reducedMotion,
      );
      battleScene.setSpeed(gameSpeed);
      scene.current = battleScene;
      const game = new Phaser.Game({
        type: Phaser.AUTO,
        parent: host.current,
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

      return () => {
        scene.current = null;
        game.destroy(true);
      };
    }, [lowEffects, reducedMotion, simulation]);

    return (
      <div
        className="battlefield"
        ref={host}
        aria-label="The Muddy Moat battlefield"
      />
    );
  },
);
