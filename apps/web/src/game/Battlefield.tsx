import {
  enemyDefinitions,
  muddyMoatLevel,
  towerDefinitions,
  type GameEvent,
  type GameState,
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

class BattleScene extends Phaser.Scene {
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private effectsGraphics!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private pausedByPlayer = false;
  private speed: GameSpeed = 1;
  private selectedTowerInstanceId: string | null = null;

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
    this.input.on(
      Phaser.Input.Events.POINTER_DOWN,
      this.handlePointerDown,
      this,
    );
    document.addEventListener("visibilitychange", this.handleVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
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

  private handlePointerDown(pointer: Phaser.Input.Pointer): void {
    const world = pointer.positionToCamera(
      this.cameras.main,
    ) as Phaser.Math.Vector2;
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

    graphics.fillStyle(0x172c2a);
    graphics.fillRect(0, 0, muddyMoatLevel.width, muddyMoatLevel.height);
    graphics.fillStyle(0x1c3832, 0.9);
    graphics.fillRect(0, 0, muddyMoatLevel.width, 74);
    graphics.fillStyle(0x10242a, 0.75);
    graphics.fillRect(0, 458, muddyMoatLevel.width, 82);

    for (const [x, y, radius] of DECORATIONS) {
      graphics.fillStyle(0x315341, 0.8);
      graphics.fillCircle(x, y, radius);
      graphics.fillStyle(0x729163, 0.7);
      graphics.fillCircle(x - 3, y - 4, Math.max(3, radius - 5));
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
      }
    }

    for (const tower of state.towers) {
      this.drawTower(graphics, tower);
    }

    for (const enemy of state.enemies) {
      const position = this.simulation.getEnemyPosition(enemy);
      const definition =
        enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
      const radius = definition.boss
        ? 25
        : enemy.enemyId === "tax-troll"
          ? 18
          : 14;
      graphics.fillStyle(0x07090d, 0.45);
      graphics.fillEllipse(position.x + 3, position.y + radius, radius * 2, 9);
      graphics.fillStyle(definition.color);
      graphics.fillCircle(position.x, position.y, radius);
      graphics.lineStyle(
        enemy.bossPhase ? 5 : 3,
        enemy.bossPhase ? 0xffd45c : 0x18202a,
      );
      graphics.strokeCircle(position.x, position.y, radius);
      graphics.fillStyle(0x12151c);
      graphics.fillCircle(position.x - radius * 0.32, position.y - 2, 2.5);
      graphics.fillCircle(position.x + radius * 0.32, position.y - 2, 2.5);

      const barWidth = definition.boss ? 58 : 34;
      graphics.fillStyle(0x1a1118, 0.95);
      graphics.fillRect(
        position.x - barWidth / 2,
        position.y - radius - 11,
        barWidth,
        5,
      );
      graphics.fillStyle(enemy.bossPhase ? 0xffb454 : 0x7ee081);
      graphics.fillRect(
        position.x - barWidth / 2,
        position.y - radius - 11,
        Math.max(1, Math.round((barWidth * enemy.health) / enemy.maxHealth)),
        5,
      );
    }

    this.renderEffects(events, state);
  }

  private drawTower(
    graphics: Phaser.GameObjects.Graphics,
    tower: TowerState,
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
    if (selected) {
      const range = definition.levels[tower.level - 1]?.range ?? 0;
      graphics.fillStyle(definition.color, 0.08);
      graphics.fillCircle(pad.position.x, pad.position.y, range);
      graphics.lineStyle(2, definition.color, 0.35);
      graphics.strokeCircle(pad.position.x, pad.position.y, range);
    }

    graphics.fillStyle(0x11141d, 0.7);
    graphics.fillCircle(pad.position.x + 3, pad.position.y + 5, 24);
    graphics.fillStyle(definition.color);
    graphics.fillCircle(pad.position.x, pad.position.y, 21);
    graphics.lineStyle(selected ? 5 : 3, selected ? 0xffffff : 0x202131);
    graphics.strokeCircle(pad.position.x, pad.position.y, 21);

    graphics.lineStyle(4, 0x282037);
    if (tower.towerId === "fork-knight") {
      graphics.lineBetween(
        pad.position.x,
        pad.position.y + 12,
        pad.position.x,
        pad.position.y - 12,
      );
      graphics.lineBetween(
        pad.position.x - 6,
        pad.position.y - 12,
        pad.position.x - 6,
        pad.position.y - 2,
      );
      graphics.lineBetween(
        pad.position.x + 6,
        pad.position.y - 12,
        pad.position.x + 6,
        pad.position.y - 2,
      );
    } else if (tower.towerId === "discount-wizard") {
      graphics.fillStyle(0x342349);
      graphics.fillTriangle(
        pad.position.x,
        pad.position.y - 14,
        pad.position.x - 12,
        pad.position.y + 10,
        pad.position.x + 12,
        pad.position.y + 10,
      );
      graphics.fillStyle(0xffe989);
      graphics.fillCircle(pad.position.x + 4, pad.position.y - 3, 3);
    } else {
      graphics.strokeCircle(pad.position.x, pad.position.y, 10);
      graphics.lineBetween(
        pad.position.x - 7,
        pad.position.y + 7,
        pad.position.x + 9,
        pad.position.y - 9,
      );
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
    const attack = [...events]
      .reverse()
      .find((event) => event.type === "tower-attacked");
    if (attack?.type === "tower-attacked") {
      const tower = state.towers.find(
        (candidate) => candidate.id === attack.towerInstanceId,
      );
      const enemy = state.enemies.find(
        (candidate) => candidate.id === attack.targetInstanceId,
      );
      const pad = tower
        ? muddyMoatLevel.pads.find((candidate) => candidate.id === tower.padId)
        : null;
      if (tower && pad && enemy) {
        const target = this.simulation.getEnemyPosition(enemy);
        const color =
          towerDefinitions[tower.towerId as keyof typeof towerDefinitions]
            .color;
        this.effectsGraphics.lineStyle(4, color, 0.8);
        this.effectsGraphics.lineBetween(
          pad.position.x,
          pad.position.y,
          target.x,
          target.y,
        );
      }
    }

    const bossPhase = events.some((event) => event.type === "boss-phase");
    if (bossPhase && !this.reducedMotion) {
      this.cameras.main.shake(220, 0.008);
    }

    if (!this.lowEffects && !this.reducedMotion) {
      for (const event of events) {
        if (event.type !== "enemy-defeated") {
          continue;
        }
        for (let spark = 0; spark < 4; spark += 1) {
          const circle = this.add.circle(
            480,
            270,
            3,
            spark % 2 === 0 ? 0xffe088 : 0xffffff,
          );
          this.tweens.add({
            targets: circle,
            x: 480 + (spark - 1.5) * 18,
            y: 248 + (spark % 2) * 18,
            alpha: 0,
            duration: 240,
            onComplete: () => circle.destroy(),
          });
        }
        break;
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
