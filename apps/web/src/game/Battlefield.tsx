import {
  campaignNodes,
  enemyDefinitions,
  levelDefinitions,
  modifierDefinitions,
  rewardDefinitions,
  TICK_MS,
  towerDefinitions,
  type EnemyState,
  type EnemyDefinition,
  type GameEvent,
  type GameState,
  type LevelDefinition,
  type Point,
  type Simulation,
  type TowerPadDefinition,
  type TowerState,
} from "@srtg/game-core";
import type { GameCommand, GameSpeed } from "@srtg/protocol";
import Phaser from "phaser";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  towerChoiceName,
  towerTacticalDescription,
  towerUpgradeDescription,
} from "./tower-copy.js";

export interface BattlefieldHandle {
  dispatch(command: GameCommand): boolean;
  confirmPlacement(preview: PlacementPreview): boolean;
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
  readonly paused: boolean;
  readonly gameSpeed: GameSpeed;
  readonly lowEffects: boolean;
  readonly reducedMotion: boolean;
  readonly onState: (state: GameState, events: readonly GameEvent[]) => void;
  readonly onTowerSelected: (tower: TowerState | null) => void;
  readonly onPlacementPreview: (preview: PlacementPreview | null) => void;
  readonly onError: (message: string) => void;
}

interface SceneCallbacks {
  readonly onState: BattlefieldProps["onState"];
  readonly onTowerSelected: BattlefieldProps["onTowerSelected"];
  readonly onPlacementPreview: BattlefieldProps["onPlacementPreview"];
  readonly onError: BattlefieldProps["onError"];
  readonly onControlsChanged: (controls: CanvasControlState) => void;
}

interface BattlefieldTheme {
  readonly ground: number;
  readonly groundAccent: number;
  readonly border: number;
  readonly pathEdge: number;
  readonly path: number;
  readonly pathHighlight: number;
  readonly decorations: readonly (readonly [number, number, number])[];
}

const BATTLEFIELD_THEMES: Record<string, BattlefieldTheme> = {
  "muddy-moat": {
    ground: 0x172c2a,
    groundAccent: 0x24483d,
    border: 0x10242a,
    pathEdge: 0x233d4b,
    path: 0x4e6971,
    pathHighlight: 0x78989d,
    decorations: [
      [31, 43, 12],
      [91, 480, 8],
      [332, 70, 10],
      [443, 467, 13],
      [689, 60, 9],
      [910, 85, 12],
    ],
  },
  "mimic-market": {
    ground: 0x30263b,
    groundAccent: 0x66435c,
    border: 0x21182b,
    pathEdge: 0x3d2930,
    path: 0x9b684d,
    pathHighlight: 0xe2ad68,
    decorations: [
      [75, 72, 13],
      [226, 470, 11],
      [396, 78, 9],
      [575, 462, 14],
      [738, 82, 10],
      [899, 448, 12],
    ],
  },
  "troll-tollway": {
    ground: 0x24313a,
    groundAccent: 0x3d555e,
    border: 0x151e26,
    pathEdge: 0x38404a,
    path: 0x73777a,
    pathHighlight: 0xd2b469,
    decorations: [
      [46, 466, 9],
      [181, 80, 13],
      [357, 470, 8],
      [529, 71, 12],
      [711, 463, 10],
      [900, 75, 14],
    ],
  },
  "castle-hassle": {
    ground: 0x2d2932,
    groundAccent: 0x574654,
    border: 0x17151d,
    pathEdge: 0x37323c,
    path: 0x756b73,
    pathHighlight: 0xcbbd9a,
    decorations: [
      [58, 58, 12],
      [92, 476, 10],
      [318, 62, 8],
      [642, 474, 13],
      [856, 73, 11],
      [905, 456, 9],
    ],
  },
  "frozen-assets": {
    ground: 0x11202f,
    groundAccent: 0x1d3a52,
    border: 0x0a1520,
    pathEdge: 0x2c4a5f,
    path: 0x6fa7bd,
    pathHighlight: 0xcdeffb,
    decorations: [
      [44, 62, 11],
      [96, 470, 9],
      [340, 66, 8],
      [455, 470, 13],
      [700, 62, 10],
      [895, 465, 12],
    ],
  },
  "department-of-unnecessary-bridges": {
    ground: 0x2c3037,
    groundAccent: 0x4c525c,
    border: 0x181b20,
    pathEdge: 0x3d434c,
    path: 0x7d8994,
    pathHighlight: 0xd2b469,
    decorations: [
      [50, 66, 10],
      [188, 468, 9],
      [365, 70, 12],
      [536, 466, 8],
      [716, 68, 11],
      [908, 462, 13],
    ],
  },
  "siege-and-desist": {
    ground: 0x2f271a,
    groundAccent: 0x5a4a2e,
    border: 0x1a1610,
    pathEdge: 0x40331f,
    path: 0x8a6f42,
    pathHighlight: 0xf0d68a,
    decorations: [
      [52, 60, 11],
      [88, 474, 9],
      [326, 64, 12],
      [648, 472, 10],
      [860, 66, 13],
      [902, 460, 9],
    ],
  },
  "lava-lamp-district": {
    ground: 0x24172d,
    groundAccent: 0x5a2634,
    border: 0x160d1c,
    pathEdge: 0x4e2630,
    path: 0x7c4a4d,
    pathHighlight: 0xffc857,
    decorations: [
      [65, 75, 10],
      [325, 475, 12],
      [540, 72, 9],
      [890, 455, 13],
    ],
  },
  "necromancers-networking-event": {
    ground: 0x171126,
    groundAccent: 0x362850,
    border: 0x0e0a18,
    pathEdge: 0x302442,
    path: 0x66517f,
    pathHighlight: 0xa8f0d0,
    decorations: [
      [60, 92, 9],
      [80, 448, 9],
      [720, 82, 11],
      [900, 470, 12],
    ],
  },
  "quarterly-dragon-review": {
    ground: 0x17202d,
    groundAccent: 0x39475e,
    border: 0x0e151e,
    pathEdge: 0x3e3640,
    path: 0x76525b,
    pathHighlight: 0xf2c14e,
    decorations: [
      [70, 70, 10],
      [80, 470, 11],
      [570, 70, 8],
      [900, 110, 13],
    ],
  },
};

function routeLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

function pointAtRoutePercent(points: readonly Point[], percent: number): Point {
  const total = routeLength(points);
  const target = (Math.max(0, Math.min(100, percent)) / 100) * total;
  let traveled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
    if (traveled + segmentLength >= target || index === points.length - 1) {
      const t = segmentLength === 0 ? 0 : (target - traveled) / segmentLength;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    traveled += segmentLength;
  }
  return points[points.length - 1]!;
}

/** Extracts the sub-polyline of a route between two percent markers, used
 * to draw marked speed zones directly on top of the authored path. */
function sliceRouteByPercent(
  points: readonly Point[],
  fromPercent: number,
  toPercent: number,
): Point[] {
  const total = routeLength(points);
  const fromDistance = (fromPercent / 100) * total;
  const toDistance = (toPercent / 100) * total;
  const result: Point[] = [pointAtRoutePercent(points, fromPercent)];
  let traveled = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    traveled += Math.hypot(b.x - a.x, b.y - a.y);
    if (traveled > fromDistance && traveled < toDistance) {
      result.push(b);
    }
  }
  result.push(pointAtRoutePercent(points, toPercent));
  return result;
}

function padShutdownState(
  pad: TowerPadDefinition,
  state: GameState,
): "warning" | "active" | null {
  if (state.exposedPadIds.includes(pad.id)) {
    return "active";
  }
  const telegraphedExposure = (
    levelDefinitions[state.levelId as keyof typeof levelDefinitions]
      ?.environmentHazards ?? []
  ).some(
    (hazard) =>
      state.telegraphedEnvironmentHazardIds.includes(hazard.id) &&
      hazard.exposedPadIds.includes(pad.id),
  );
  if (telegraphedExposure) {
    return "warning";
  }
  if (
    state.phase !== "active" ||
    state.waveStartedAtTick === null ||
    !pad.shutdowns
  ) {
    return null;
  }
  const elapsed = state.tick - state.waveStartedAtTick;
  const extraTicks = state.modifierIds.reduce(
    (total, modifierId) =>
      total +
      (modifierDefinitions[modifierId as keyof typeof modifierDefinitions]
        ?.padShutdownExtraTicks ?? 0),
    0,
  );
  const window = pad.shutdowns.find(
    (shutdown) =>
      shutdown.waveIndex === state.waveIndex &&
      elapsed < shutdown.toTick + extraTicks &&
      elapsed >= Math.max(0, shutdown.fromTick - 80),
  );
  if (!window) {
    return null;
  }
  return elapsed >= window.fromTick ? "active" : "warning";
}

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
  level: { readonly width: number; readonly height: number },
): readonly Point[] {
  const gap = CONTROL_GAP;
  const width = count * size + (count - 1) * gap;
  const scaledAnchor = {
    x: (anchor.x / level.width) * frame.width,
    y: (anchor.y / level.height) * frame.height,
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

function worldToCanvasPosition(
  point: Point,
  frame: CanvasFrame,
  level: { readonly width: number; readonly height: number },
): Point {
  return {
    x: (point.x / level.width) * frame.width,
    y: (point.y / level.height) * frame.height,
  };
}

function contextLabelPosition(
  anchor: Point,
  controls: readonly Point[],
  frame: CanvasFrame,
  level: { readonly width: number; readonly height: number },
): Point {
  const scaledAnchor = worldToCanvasPosition(anchor, frame, level);
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

function towerAvailableOnPad(
  pad: TowerPadDefinition,
  towerId: string,
): boolean {
  return (
    (!pad.allowedTowerIds || pad.allowedTowerIds.includes(towerId)) &&
    !pad.deniedTowerIds?.includes(towerId)
  );
}

interface EnemySnapshot extends Point {
  readonly color: number;
  readonly boss: boolean;
}

interface TransientEffect extends Point {
  readonly kind:
    "spawn" | "defeat" | "leak" | "boss-phase" | "ability" | "referral";
  readonly color: number;
  readonly startedAtTick: number;
  readonly variant: number;
}

class BattleScene extends Phaser.Scene {
  private mapGraphics!: Phaser.GameObjects.Graphics;
  private effectsGraphics!: Phaser.GameObjects.Graphics;
  private accumulator = 0;
  private paused: boolean;
  private speed: GameSpeed = 1;
  private selectedTowerInstanceId: string | null = null;
  private placementPreview: PlacementPreview | null = null;
  private wheelPadId: string | null = null;
  private enemySnapshots = new Map<string, EnemySnapshot>();
  private transientEffects: TransientEffect[] = [];
  private readonly level: LevelDefinition;
  private readonly theme;

  public constructor(
    private readonly simulation: Simulation,
    private readonly callbacks: SceneCallbacks,
    private lowEffects: boolean,
    private reducedMotion: boolean,
    private managementDisabled: boolean,
    initialPlacementPreview: PlacementPreview | null,
    initialPaused: boolean,
  ) {
    super({ key: "battle" });
    const level =
      levelDefinitions[
        simulation.state.levelId as keyof typeof levelDefinitions
      ];
    if (!level) {
      throw new Error(`Unknown battlefield level: ${simulation.state.levelId}`);
    }
    this.level = level;
    this.theme =
      BATTLEFIELD_THEMES[simulation.state.levelId] ??
      BATTLEFIELD_THEMES["muddy-moat"]!;
    this.placementPreview = initialPlacementPreview;
    this.paused = initialPaused;
  }

  public create(): void {
    this.mapGraphics = this.add.graphics();
    this.effectsGraphics = this.add.graphics();
    this.game.canvas.addEventListener(
      "pointerdown",
      this.handleCanvasPointerDown,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener(
        "pointerdown",
        this.handleCanvasPointerDown,
      );
    });
    this.publishControls();
    this.renderState(this.simulation.state, []);
    this.callbacks.onState(this.simulation.state, []);
  }

  public override update(_time: number, delta: number): void {
    if (this.paused || this.simulation.state.phase !== "active") {
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
    const pad = this.level.pads.find((candidate) => candidate.id === padId);
    if (pad?.allowedTowerIds && !pad.allowedTowerIds.includes(towerId)) {
      this.callbacks.onError(
        `${towerDefinitions[towerId as keyof typeof towerDefinitions].name} is not licensed for this pad.`,
      );
      return;
    }
    if (pad?.deniedTowerIds?.includes(towerId)) {
      this.callbacks.onError(
        `${towerDefinitions[towerId as keyof typeof towerDefinitions].name} cannot be placed here.`,
      );
      return;
    }
    if (pad && padShutdownState(pad, this.simulation.state) === "active") {
      this.callbacks.onError("That pad is temporarily shut down.");
      return;
    }
    this.wheelPadId = null;
    this.callbacks.onPlacementPreview({ towerId, padId });
    this.publishControls();
    this.renderState(this.simulation.state, []);
  }

  public selectPad(padId: string): void {
    const pad = this.level.pads.find((candidate) => candidate.id === padId);
    if (!pad) {
      this.callbacks.onError("That tower pad is not available.");
      return;
    }
    this.handlePadSelection(pad);
  }

  public setPaused(paused: boolean): void {
    this.paused = paused;
  }

  public setSpeed(speed: GameSpeed): void {
    this.speed = speed;
  }

  public setEffectSettings(lowEffects: boolean, reducedMotion: boolean): void {
    this.lowEffects = lowEffects;
    this.reducedMotion = reducedMotion;
    this.renderState(this.simulation.state, []);
  }

  private readonly handleCanvasPointerDown = (event: PointerEvent): void => {
    const bounds = this.game.canvas.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }
    const scale = Math.min(
      bounds.width / this.level.width,
      bounds.height / this.level.height,
    );
    this.handleWorldPointer(
      {
        x: ((event.clientX - bounds.left) * this.level.width) / bounds.width,
        y: ((event.clientY - bounds.top) * this.level.height) / bounds.height,
      },
      Math.max(38, 24 / scale),
    );
  };

  private handleWorldPointer(world: Point, padHitRadius: number): void {
    const pad = this.level.pads.find(
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

  private handlePadSelection(pad: TowerPadDefinition): void {
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
    if (padShutdownState(pad, this.simulation.state) === "active") {
      this.callbacks.onError("That pad is temporarily shut down.");
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

    graphics.fillStyle(this.theme.ground);
    graphics.fillRect(0, 0, this.level.width, this.level.height);
    graphics.fillStyle(this.theme.groundAccent, 0.34);
    graphics.fillEllipse(210, 28, 430, 108);
    graphics.fillStyle(0x0b1d25, 0.42);
    graphics.fillEllipse(755, 525, 520, 110);
    graphics.fillStyle(this.theme.groundAccent, 0.9);
    graphics.fillRect(0, 0, this.level.width, 74);
    graphics.fillStyle(this.theme.border, 0.75);
    graphics.fillRect(0, this.level.height - 82, this.level.width, 82);

    for (const [x, y, radius] of this.theme.decorations) {
      graphics.fillStyle(this.theme.groundAccent, 0.8);
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

    const routes = this.level.routes ?? [{ id: "main", path: this.level.path }];
    for (const route of routes) {
      const pathPoints = route.path.map(
        (point) => new Phaser.Math.Vector2(point.x, point.y),
      );
      graphics.lineStyle(70, this.theme.pathEdge, 1);
      graphics.strokePoints(pathPoints, false, false);
      graphics.lineStyle(54, this.theme.path, 1);
      graphics.strokePoints(pathPoints, false, false);
      graphics.lineStyle(4, this.theme.pathHighlight, 0.65);
      graphics.strokePoints(pathPoints, false, false);
    }
    this.drawEnvironmentHazards(graphics, state, motionEnabled);
    this.drawSpeedZones(graphics, routes, state, motionEnabled);
    this.drawPortalAndTunnel(graphics, state.tick, state.phase === "active");

    const occupiedPads = new Set(state.towers.map((tower) => tower.padId));
    for (const pad of this.level.pads) {
      const shutdown = padShutdownState(pad, state);
      graphics.fillStyle(
        shutdown === "active"
          ? 0x6f292b
          : occupiedPads.has(pad.id)
            ? 0x27333a
            : 0x293f38,
        0.95,
      );
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
      if (shutdown) {
        graphics.lineStyle(
          shutdown === "active" ? 7 : 4,
          shutdown === "active" ? 0xff675f : 0xffd166,
          shutdown === "active" ? 0.95 : 0.75,
        );
        graphics.strokeCircle(
          pad.position.x,
          pad.position.y,
          shutdown === "active" ? 34 : 33,
        );
        graphics.lineBetween(
          pad.position.x - 18,
          pad.position.y - 18,
          pad.position.x + 18,
          pad.position.y + 18,
        );
      } else if (pad.allowedTowerIds) {
        graphics.lineStyle(4, 0xffd166, 0.8);
        graphics.lineBetween(
          pad.position.x - 18,
          pad.position.y - 22,
          pad.position.x + 18,
          pad.position.y - 22,
        );
      }
      if (pad.deniedTowerIds && pad.deniedTowerIds.length > 0) {
        // A distinct icy "no entry" ring, independent of the allow-list
        // stripe above, telegraphing which specific towers are rejected.
        graphics.lineStyle(3, 0x9fe0f2, 0.85);
        graphics.strokeCircle(pad.position.x, pad.position.y, 38);
        graphics.lineStyle(2, 0x9fe0f2, 0.6);
        graphics.lineBetween(
          pad.position.x - 15,
          pad.position.y + 24,
          pad.position.x + 15,
          pad.position.y + 30,
        );
      }
      if (pad.clusterId) {
        // A dashed outer ring groups pads that are telegraphed/authored
        // together (e.g. a shared cluster shutdown schedule).
        graphics.lineStyle(2, 0xd4af37, 0.55);
        for (let ray = 0; ray < 10; ray += 1) {
          const angle = (Math.PI * 2 * ray) / 10;
          graphics.lineBetween(
            pad.position.x + Math.cos(angle) * 40,
            pad.position.y + Math.sin(angle) * 40,
            pad.position.x + Math.cos(angle) * 44,
            pad.position.y + Math.sin(angle) * 44,
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
    if (this.placementPreview) {
      const pad = this.level.pads.find(
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
      const definition: EnemyDefinition =
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

  private drawSpeedZones(
    graphics: Phaser.GameObjects.Graphics,
    routes: readonly { readonly id: string; readonly path: readonly Point[] }[],
    state: GameState,
    motionEnabled: boolean,
  ): void {
    const zones = this.level.speedZones;
    if (!zones || zones.length === 0) {
      return;
    }
    const pulse = motionEnabled
      ? 0.55 + Math.sin(state.tick * 0.15) * 0.15
      : 0.6;
    for (const zone of zones) {
      const route = routes.find((candidate) => candidate.id === zone.routeId);
      if (!route) {
        continue;
      }
      const slice = sliceRouteByPercent(
        route.path,
        zone.fromPercent,
        zone.toPercent,
      );
      if (slice.length < 2) {
        continue;
      }
      const points = slice.map(
        (point) => new Phaser.Math.Vector2(point.x, point.y),
      );
      const active =
        !zone.activationHazardId ||
        state.activeEnvironmentHazardIds.includes(zone.activationHazardId);
      const warning =
        zone.activationHazardId &&
        state.telegraphedEnvironmentHazardIds.includes(zone.activationHazardId);
      const color = zone.activationHazardId ? 0xff8a4c : 0x9fe0f2;
      graphics.lineStyle(58, color, active ? 0.34 : warning ? 0.2 : 0.08);
      graphics.strokePoints(points, false, false);
      graphics.lineStyle(3, color, active ? pulse : warning ? 0.6 : 0.3);
      graphics.strokePoints(points, false, false);
      if (zone.activationHazardId) {
        const marker = pointAtRoutePercent(
          route.path,
          (zone.fromPercent + zone.toPercent) / 2,
        );
        graphics.fillStyle(color, active ? 0.95 : 0.55);
        graphics.fillTriangle(
          marker.x,
          marker.y - 10,
          marker.x - 9,
          marker.y + 7,
          marker.x + 9,
          marker.y + 7,
        );
      }
    }
  }

  private drawEnvironmentHazards(
    graphics: Phaser.GameObjects.Graphics,
    state: GameState,
    motionEnabled: boolean,
  ): void {
    for (const hazard of this.level.environmentHazards ?? []) {
      const pads = hazard.exposedPadIds
        .map((padId) => this.level.pads.find((pad) => pad.id === padId))
        .filter((pad): pad is TowerPadDefinition => Boolean(pad));
      if (pads.length === 0) {
        continue;
      }
      const center = pads.reduce(
        (point, pad) => ({
          x: point.x + pad.position.x / pads.length,
          y: point.y + pad.position.y / pads.length,
        }),
        { x: 0, y: 0 },
      );
      const active = state.activeEnvironmentHazardIds.includes(hazard.id);
      const warning = state.telegraphedEnvironmentHazardIds.includes(hazard.id);
      const pulse =
        motionEnabled && (active || warning)
          ? Math.sin(state.tick * 0.18) * 6
          : 0;
      graphics.fillStyle(0x4b1723, 0.88);
      graphics.fillEllipse(center.x, center.y, 102, 66);
      graphics.fillStyle(
        active ? 0xff5b3d : warning ? 0xffb347 : 0xa73338,
        0.7,
      );
      graphics.fillEllipse(center.x, center.y, 76 + pulse, 43 + pulse * 0.5);
      graphics.lineStyle(active ? 6 : 3, active ? 0xffe08a : 0xff8a4c, 0.86);
      graphics.strokeEllipse(center.x, center.y, 92 + pulse, 57 + pulse * 0.5);
      for (let vent = -1; vent <= 1; vent += 1) {
        graphics.fillStyle(active ? 0xffe08a : 0xff8a4c, active ? 0.9 : 0.5);
        graphics.fillTriangle(
          center.x + vent * 24,
          center.y - 12 - (active ? 20 + Math.abs(pulse) : 5),
          center.x - 7 + vent * 24,
          center.y + 4,
          center.x + 7 + vent * 24,
          center.y + 4,
        );
      }
    }
  }

  private drawPortalAndTunnel(
    graphics: Phaser.GameObjects.Graphics,
    tick: number,
    active: boolean,
  ): void {
    const entrance = this.level.path[0];
    const exit = this.level.path.at(-1);
    if (!entrance || !exit) {
      return;
    }
    const pulse =
      active && !this.lowEffects && !this.reducedMotion
        ? Math.sin(tick * 0.35) * 4
        : 0;
    graphics.fillStyle(0x0a141c, 0.96);
    graphics.fillEllipse(entrance.x, entrance.y, 54, 94);
    graphics.lineStyle(7, 0x7250a4, 0.9);
    graphics.strokeEllipse(entrance.x, entrance.y, 48 + pulse, 86 + pulse);
    graphics.lineStyle(3, 0xb58bea, 0.65);
    graphics.strokeEllipse(
      entrance.x,
      entrance.y,
      31 - pulse * 0.3,
      64 - pulse * 0.3,
    );
    graphics.fillStyle(0x9a70cc, active ? 0.3 : 0.12);
    graphics.fillEllipse(entrance.x, entrance.y, 19 + pulse, 50 + pulse);

    graphics.fillStyle(0x09151a, 0.98);
    graphics.fillRoundedRect(exit.x - 24, exit.y - 45, 48, 90, 22);
    graphics.lineStyle(6, 0x425866, 1);
    graphics.strokeRoundedRect(exit.x - 24, exit.y - 45, 48, 90, 22);
    graphics.lineStyle(3, 0x7b9394, 0.55);
    graphics.strokeRoundedRect(exit.x - 15, exit.y - 36, 30, 72, 16);
    graphics.fillStyle(0xffcb61, 0.8);
    graphics.fillCircle(exit.x - 22, exit.y - 23, 4);
    graphics.fillCircle(exit.x + 22, exit.y - 23, 4);
  }

  private drawEnemy(
    graphics: Phaser.GameObjects.Graphics,
    enemy: EnemyState,
    position: Point,
    tick: number,
    wasHit: boolean,
  ): void {
    const definition: EnemyDefinition =
      enemyDefinitions[enemy.enemyId as keyof typeof enemyDefinitions];
    const largeEnemy =
      definition.boss || definition.encounterRole === "miniboss";
    const animated = !this.lowEffects && !this.reducedMotion;
    const stride = animated
      ? Math.sin((tick + enemy.variant * 5) * (largeEnemy ? 0.3 : 0.65))
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
    const y = position.y + stride * (largeEnemy ? 1.5 : 2.4);
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
    } else if (enemy.enemyId === "grand-till-mimic") {
      graphics.fillStyle(0x07090d, 0.56);
      graphics.fillEllipse(x, position.y + 31, 82, 14);
      graphics.lineStyle(7, 0x6b3a24);
      graphics.lineBetween(x - 24, y + 23, x - 31 - stride * 2, y + 38);
      graphics.lineBetween(x + 24, y + 23, x + 31 + stride * 2, y + 38);
      graphics.fillStyle(enemy.bossPhaseIndex >= 2 ? 0xc94b32 : 0x8f5732);
      graphics.fillRoundedRect(x - 39, y - 16, 78, 55, 8);
      graphics.lineStyle(wasHit ? 8 : 5, outline);
      graphics.strokeRoundedRect(x - 39, y - 16, 78, 55, 8);
      graphics.fillStyle(definition.color);
      graphics.fillRoundedRect(x - 43, y - 35 - Math.abs(stride), 86, 24, 9);
      graphics.strokeRoundedRect(x - 43, y - 35 - Math.abs(stride), 86, 24, 9);
      graphics.fillStyle(0x27151a);
      graphics.fillRect(x - 31, y - 10, 62, 26);
      graphics.fillStyle(0xfff0c2);
      for (let tooth = -26; tooth <= 22; tooth += 8) {
        graphics.fillTriangle(
          x + tooth,
          y - 10,
          x + tooth + 7,
          y - 10,
          x + tooth + 3.5,
          y - 2,
        );
        graphics.fillTriangle(
          x + tooth,
          y + 16,
          x + tooth + 7,
          y + 16,
          x + tooth + 3.5,
          y + 8,
        );
      }
      graphics.fillStyle(0xffdf69);
      graphics.fillRect(x - 6, y + 17, 12, 16);
      graphics.lineStyle(3, 0x6b3a24);
      graphics.strokeRect(x - 6, y + 17, 12, 16);
      graphics.fillStyle(0xeef7d0);
      graphics.fillCircle(x - 15 + facing * 2, y - 25, 4);
      graphics.fillCircle(x + 15 + facing * 2, y - 25, 4);
    } else if (
      enemy.enemyId === "tax-troll" ||
      enemy.enemyId === "frozen-auditor"
    ) {
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
      if (enemy.enemyId === "frozen-auditor") {
        graphics.lineStyle(3, 0xd9f6ff, 0.9);
        graphics.lineBetween(x - 18, y + 5, x - 8, y - 5);
        graphics.lineBetween(x - 8, y - 5, x + 3, y + 2);
        graphics.lineBetween(x + 3, y + 2, x + 17, y - 10);
      }
    } else if (enemy.enemyId === "coupon-squire") {
      graphics.fillStyle(0x07090d, 0.44);
      graphics.fillEllipse(x, position.y + 19, 40, 9);
      graphics.fillStyle(0x526e46);
      graphics.fillEllipse(x, y, 31, 35);
      graphics.lineStyle(wasHit ? 5 : 3, outline);
      graphics.strokeEllipse(x, y, 31, 35);
      graphics.fillStyle(definition.color);
      graphics.fillTriangle(x - 13, y - 8, x, y - 24, x + 13, y - 8);
      graphics.fillStyle(0xf4e8ad);
      graphics.fillRoundedRect(x + facing * 5 - 13, y - 3, 26, 24, 4);
      graphics.lineStyle(2, 0x7f593a);
      graphics.strokeRoundedRect(x + facing * 5 - 13, y - 3, 26, 24, 4);
      graphics.lineBetween(
        x + facing * 5 - 8,
        y + 4,
        x + facing * 5 + 8,
        y + 4,
      );
      graphics.lineBetween(
        x + facing * 5 - 8,
        y + 10,
        x + facing * 5 + 5,
        y + 10,
      );
      graphics.fillStyle(0xf8f2d2);
      graphics.fillCircle(x - facing * 5, y - 8, 3);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x - facing * 4, y - 8, 1.5);
    } else if (enemy.enemyId === "queue-jumper") {
      graphics.fillStyle(0x07090d, 0.4);
      graphics.fillEllipse(x, position.y + 18, 38, 8);
      graphics.lineStyle(5, 0x314454);
      graphics.lineBetween(x - 5, y + 12, x - 12 - stride * 4, y + 22);
      graphics.lineBetween(x + 5, y + 12, x + 15 + stride * 4, y + 19);
      graphics.fillStyle(definition.color);
      graphics.fillTriangle(x - 14, y + 12, x, y - 18, x + 14, y + 12);
      graphics.lineStyle(wasHit ? 5 : 3, outline);
      graphics.strokeTriangle(x - 14, y + 12, x, y - 18, x + 14, y + 12);
      graphics.fillStyle(0xf3f0cc);
      graphics.fillCircle(x, y - 16, 10);
      graphics.fillStyle(0x35233d);
      graphics.fillTriangle(x - 10, y - 18, x, y - 30, x + 10, y - 18);
      graphics.lineStyle(3, 0xffef82);
      graphics.lineBetween(x - 9, y - 1, x + 9, y - 1);
      graphics.lineBetween(x - 7, y + 6, x + 7, y + 6);
      graphics.lineStyle(4, 0xeef6ff);
      graphics.lineBetween(x - facing * 16, y - 7, x - facing * 29, y - 7);
      graphics.lineBetween(x - facing * 19, y + 1, x - facing * 34, y + 1);
    } else if (enemy.enemyId === "bog-guard") {
      graphics.fillStyle(0x07090d, 0.46);
      graphics.fillEllipse(x, position.y + 22, 50, 10);
      graphics.fillStyle(0x4f633b);
      graphics.fillRoundedRect(x - 22, y - 14, 44, 39, 12);
      graphics.lineStyle(wasHit ? 5 : 4, outline);
      graphics.strokeRoundedRect(x - 22, y - 14, 44, 39, 12);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 12, 35, 25);
      graphics.fillStyle(0x765e3c);
      graphics.fillRect(x - 18, y - 24, 36, 8);
      graphics.fillTriangle(x - 18, y - 24, x - 10, y - 35, x - 5, y - 24);
      graphics.fillTriangle(x + 4, y - 24, x + 12, y - 37, x + 16, y - 24);
      graphics.fillStyle(0xeaf0c2);
      graphics.fillCircle(x + facing * 7, y - 13, 3);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x + facing * 8, y - 13, 1.5);
      graphics.lineStyle(3, 0xa2c46a);
      graphics.lineBetween(x - 15, y + 8, x - 25, y - 25);
      graphics.lineBetween(x + 15, y + 10, x + 25, y - 20);
    } else if (enemy.enemyId === "baron-von-bog") {
      graphics.fillStyle(0x07090d, 0.52);
      graphics.fillEllipse(x, position.y + 31, 72, 13);
      graphics.fillStyle(enemy.bossPhase ? 0x8d3d35 : 0x59452d);
      graphics.fillEllipse(x, y + 5, reactiveHit ? 51 : 58, 58);
      graphics.lineStyle(wasHit ? 7 : 5, outline);
      graphics.strokeEllipse(x, y + 5, reactiveHit ? 51 : 58, 58);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 9, 43, 35);
      graphics.fillStyle(0xf3d26f);
      graphics.fillTriangle(x - 20, y - 28, x - 15, y - 43, x - 7, y - 27);
      graphics.fillTriangle(x - 8, y - 28, x, y - 47, x + 8, y - 28);
      graphics.fillTriangle(x + 7, y - 27, x + 16, y - 43, x + 21, y - 27);
      graphics.fillRect(x - 21, y - 30, 42, 7);
      graphics.fillStyle(0xfff3cd);
      graphics.fillCircle(x - 8 + facing, y - 12, 4);
      graphics.fillCircle(x + 8 + facing, y - 12, 4);
      graphics.fillStyle(0x201823);
      graphics.fillCircle(x - 7 + facing * 2, y - 12, 2);
      graphics.fillCircle(x + 9 + facing * 2, y - 12, 2);
      graphics.lineStyle(5, 0x302018);
      graphics.lineBetween(x - 18, y + 1, x, y + 7);
      graphics.lineBetween(x, y + 7, x + 18, y + 1);
      graphics.lineStyle(5, 0x78904d);
      graphics.lineBetween(x - facing * 27, y + 12, x - facing * 39, y + 29);
    } else if (enemy.enemyId === "warranty-wraith") {
      graphics.fillStyle(0x07090d, 0.28);
      graphics.fillEllipse(x, position.y + 18, 38, 8);
      const wraithAlpha = reactiveHit ? 0.55 : 0.72;
      graphics.fillStyle(0x1c3a44, wraithAlpha * 0.9);
      graphics.fillEllipse(x, y - 4, 34, 40);
      // Tattered hem: a row of small triangles instead of a solid base,
      // an accessible shape cue (not just color) for "incorporeal".
      for (let tooth = -14; tooth <= 14; tooth += 7) {
        graphics.fillTriangle(
          x + tooth,
          y + 16,
          x + tooth + 7,
          y + 16,
          x + tooth + 3.5,
          y + 26 + Math.abs(stride) * 2,
        );
      }
      graphics.fillStyle(definition.color, wraithAlpha);
      graphics.fillEllipse(x, y - 6, 30, 34);
      graphics.lineStyle(wasHit ? 4 : 2, outline, 0.9);
      graphics.strokeEllipse(x, y - 6, 30, 34);
      graphics.fillStyle(0xffffff, 0.85);
      graphics.fillCircle(x - 6 + facing, y - 12, 3);
      graphics.fillCircle(x + 6 + facing, y - 12, 3);
      graphics.fillStyle(0x14232a);
      graphics.fillCircle(x - 5 + facing * 2, y - 12, 1.4);
      graphics.fillCircle(x + 7 + facing * 2, y - 12, 1.4);
      // Floating claim clipboard: the "warranty" identity marker.
      graphics.fillStyle(0xf4e9c8, 0.95);
      graphics.fillRoundedRect(x + facing * 16 - 6, y + 2, 12, 15, 2);
      graphics.lineStyle(1, 0x8a7350, 0.9);
      graphics.strokeRoundedRect(x + facing * 16 - 6, y + 2, 12, 15, 2);
      graphics.lineBetween(
        x + facing * 16 - 3,
        y + 7,
        x + facing * 16 + 3,
        y + 7,
      );
      graphics.lineBetween(
        x + facing * 16 - 3,
        y + 11,
        x + facing * 16 + 1,
        y + 11,
      );
    } else if (enemy.enemyId === "middle-manager-mage") {
      // Visible aura ring: telegraphs the speed-aura mechanic on the
      // silhouette itself, distinct from the boss-phase ray burst above.
      graphics.lineStyle(2, 0xe8955a, 0.3 + Math.abs(stride) * 0.12);
      graphics.strokeCircle(x, y, 46);
      graphics.fillStyle(0x07090d, 0.42);
      graphics.fillEllipse(x, position.y + 17, 36, 8);
      graphics.fillStyle(0x2b2b33);
      graphics.fillRoundedRect(x - 15, y - 4, 30, 28, 6);
      graphics.lineStyle(wasHit ? 4 : 3, outline);
      graphics.strokeRoundedRect(x - 15, y - 4, 30, 28, 6);
      graphics.fillStyle(0xf2f2f2);
      graphics.fillRect(x - 4, y - 3, 8, 20);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 14, 22, 20);
      graphics.fillStyle(0x1c1c22);
      graphics.fillRect(x - 10, y - 22, 20, 5);
      graphics.fillStyle(0xfff0d9);
      graphics.fillCircle(x - 5 + facing, y - 14, 2.6);
      graphics.fillCircle(x + 5 + facing, y - 14, 2.6);
      // Briefcase: readable "management" identity marker.
      graphics.fillStyle(0x5a3d22);
      graphics.fillRoundedRect(x + facing * 15 - 6, y + 8, 12, 9, 2);
      graphics.lineStyle(1, 0x2c1d10);
      graphics.strokeRoundedRect(x + facing * 15 - 6, y + 8, 12, 9, 2);
    } else if (enemy.enemyId === "comptroller-general") {
      graphics.fillStyle(0x07090d, 0.48);
      graphics.fillEllipse(x + 2, position.y + 24, 54, 11);
      graphics.fillStyle(0x3f3323);
      graphics.fillEllipse(x, y + 4, reactiveHit ? 44 : 50, 44);
      graphics.lineStyle(wasHit ? 6 : 4, outline);
      graphics.strokeEllipse(x, y + 4, wasHit ? 44 : 50, 44);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 10, 34, 27);
      // General's sash: a diagonal accent stripe distinct from Tax Troll's
      // horizontal ledger band.
      graphics.lineStyle(6, 0xd4af37, 0.9);
      graphics.lineBetween(x - 18, y - 2, x + 18, y + 20);
      graphics.fillStyle(0xc9d5d5);
      graphics.fillTriangle(x - 9, y - 19, x - 21, y - 31, x - 18, y - 11);
      graphics.fillTriangle(x + 9, y - 19, x + 21, y - 31, x + 18, y - 11);
      graphics.fillStyle(0xf4f0d2);
      graphics.fillCircle(x - 6 + facing, y - 11 + directionY, 3.2);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x - 5 + facing * 2, y - 11 + directionY, 1.6);
      graphics.fillStyle(0xe6ddba);
      graphics.fillRoundedRect(x + facing * 20 - 7, y + 4, 14, 20, 2);
      graphics.lineStyle(2, 0x695a49);
      graphics.strokeRoundedRect(x + facing * 20 - 7, y + 4, 14, 20, 2);
    } else if (enemy.enemyId === "refund-slime") {
      graphics.fillStyle(0x07090d, 0.4);
      graphics.fillEllipse(x, position.y + 15, 34, 7);
      // Wavy ooze silhouette built from overlapping circles rather than a
      // single ellipse, distinguishing it by shape from every other blob.
      const wobble = Math.abs(stride) * 3;
      graphics.fillStyle(definition.color, 0.92);
      graphics.fillCircle(x - 10, y + 4, 13 + wobble * 0.3);
      graphics.fillCircle(x + 10, y + 4, 13 - wobble * 0.3);
      graphics.fillCircle(x, y - 6, 17);
      graphics.lineStyle(wasHit ? 4 : 2, outline, 0.85);
      graphics.strokeCircle(x - 10, y + 4, 13 + wobble * 0.3);
      graphics.strokeCircle(x + 10, y + 4, 13 - wobble * 0.3);
      graphics.strokeCircle(x, y - 6, 17);
      graphics.fillStyle(0xffffff, 0.55);
      graphics.fillCircle(x - 6, y - 10, 4);
      graphics.fillStyle(0x18202a);
      graphics.fillCircle(x - 4 + facing, y - 4, 2);
      graphics.fillCircle(x + 4 + facing, y - 4, 2);
      // Denied-claim receipt: readable "refund" identity marker.
      graphics.fillStyle(0xf4e9c8, 0.9);
      graphics.fillRect(x - 5, y + 6, 10, 6);
      graphics.lineStyle(1, 0xc0342f, 0.9);
      graphics.lineBetween(x - 4, y + 7, x + 4, y + 11);
      graphics.lineBetween(x + 4, y + 7, x - 4, y + 11);
    } else if (enemy.enemyId === "lava-lamp-landlord") {
      const phaseColor =
        enemy.bossPhaseIndex >= 2
          ? 0xffd166
          : enemy.bossPhaseIndex === 1
            ? 0x8f4938
            : definition.color;
      graphics.fillStyle(0x07090d, 0.58);
      graphics.fillEllipse(x, position.y + 35, 86, 15);
      graphics.fillStyle(0x592b32);
      graphics.fillTriangle(x - 38, y + 31, x - 22, y - 19, x - 4, y + 34);
      graphics.fillTriangle(x + 38, y + 31, x + 22, y - 19, x + 4, y + 34);
      graphics.fillStyle(phaseColor);
      graphics.fillEllipse(x, y + 2, reactiveHit ? 50 : 58, 69);
      graphics.lineStyle(wasHit ? 8 : 5, outline);
      graphics.strokeEllipse(x, y + 2, reactiveHit ? 50 : 58, 69);
      graphics.fillStyle(0xffc857);
      graphics.fillTriangle(x - 24, y - 18, x - 12, y - 47, x - 2, y - 19);
      graphics.fillTriangle(x + 24, y - 18, x + 12, y - 47, x + 2, y - 19);
      graphics.fillStyle(0xfff4d6);
      graphics.fillCircle(x - 10 + facing, y - 9, 4);
      graphics.fillCircle(x + 10 + facing, y - 9, 4);
      graphics.fillStyle(0x31151c);
      graphics.fillCircle(x - 9 + facing * 2, y - 9, 2);
      graphics.fillCircle(x + 11 + facing * 2, y - 9, 2);
      graphics.lineStyle(4, 0xffd166, 0.9);
      graphics.lineBetween(x - 18, y + 13, x + 18, y + 13);
      graphics.lineBetween(x - 13, y + 22, x + 13, y + 22);
    } else if (enemy.enemyId === "queen-of-pending-litigation") {
      graphics.fillStyle(0x07090d, 0.55);
      graphics.fillEllipse(x, position.y + 33, 78, 14);
      // Bell-shaped gown instead of Baron's rounded body: a distinct
      // silhouette for the finale boss.
      graphics.fillStyle(enemy.bossPhaseIndex >= 2 ? 0x7a1030 : 0x531a33);
      graphics.fillTriangle(x - 40, y + 30, x + 40, y + 30, x, y - 20);
      graphics.lineStyle(wasHit ? 7 : 5, outline);
      graphics.strokeTriangle(x - 40, y + 30, x + 40, y + 30, x, y - 20);
      graphics.fillStyle(definition.color);
      graphics.fillEllipse(x, y - 24, 32, 28);
      graphics.fillStyle(0xffe066);
      graphics.fillTriangle(x - 16, y - 40, x - 10, y - 55, x - 3, y - 39);
      graphics.fillTriangle(x - 5, y - 41, x, y - 58, x + 5, y - 41);
      graphics.fillTriangle(x + 3, y - 39, x + 10, y - 55, x + 16, y - 40);
      graphics.fillStyle(0xfff3cd);
      graphics.fillCircle(x - 7 + facing, y - 26, 3.6);
      graphics.fillCircle(x + 7 + facing, y - 26, 3.6);
      graphics.fillStyle(0x201823);
      graphics.fillCircle(x - 6 + facing * 2, y - 26, 1.8);
      graphics.fillCircle(x + 8 + facing * 2, y - 26, 1.8);
      graphics.lineStyle(3, 0xffd7e0);
      graphics.lineBetween(x - 12, y + 2, x + 12, y + 2);
      graphics.lineBetween(x - 14, y + 10, x + 14, y + 10);
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

    if (enemy.enemyId === "dragon-intern") {
      graphics.fillStyle(0xf7e5b1, 0.95);
      graphics.fillRoundedRect(x - 13, y + 12, 26, 17, 3);
      graphics.lineStyle(2, 0x7d3150);
      graphics.strokeRoundedRect(x - 13, y + 12, 26, 17, 3);
      graphics.lineBetween(x - 6, y + 17, x + 6, y + 17);
    } else if (enemy.enemyId === "chief-executive-dragon") {
      const stageColor =
        enemy.bossPhaseIndex >= 2
          ? 0xff5b4d
          : enemy.bossPhaseIndex === 1
            ? 0xd9b45b
            : 0x8be7ff;
      graphics.fillStyle(0xffd45c);
      graphics.fillTriangle(x - 21, y - 30, x - 14, y - 52, x - 5, y - 31);
      graphics.fillTriangle(x - 8, y - 32, x, y - 57, x + 8, y - 32);
      graphics.fillTriangle(x + 5, y - 31, x + 14, y - 52, x + 21, y - 30);
      graphics.lineStyle(4, stageColor, 0.95);
      for (let marker = 0; marker < 3; marker += 1) {
        graphics.lineBetween(
          x - 18 + marker * 18,
          y + 31,
          x - 11 + marker * 18,
          y + 38,
        );
        graphics.lineBetween(
          x - 11 + marker * 18,
          y + 38,
          x - 4 + marker * 18,
          y + 31,
        );
      }
    }

    if (enemy.spectral) {
      const spectralPulse = animated ? Math.sin(tick * 0.22) * 3 : 0;
      graphics.lineStyle(4, 0xa8f0d0, 0.9);
      graphics.strokeCircle(x, y, (largeEnemy ? 42 : 28) + spectralPulse);
      graphics.fillStyle(0xd8fff0, 0.92);
      for (let marker = 0; marker < 4; marker += 1) {
        const angle = (Math.PI * 2 * marker) / 4;
        const markerX = x + Math.cos(angle) * 32;
        const markerY = y + Math.sin(angle) * 32;
        graphics.fillTriangle(
          markerX,
          markerY - 5,
          markerX - 4,
          markerY,
          markerX,
          markerY + 5,
        );
        graphics.fillTriangle(
          markerX,
          markerY - 5,
          markerX + 4,
          markerY,
          markerX,
          markerY + 5,
        );
      }
    }

    if (
      !enemy.wardConsumed &&
      definition.traits?.some((trait) => trait.kind === "first-hit-ward")
    ) {
      const shieldRadius = largeEnemy ? 38 : 27;
      graphics.lineStyle(4, 0x8be7ff, 0.88);
      graphics.strokeCircle(x, y, shieldRadius);
      graphics.lineStyle(2, 0xe7fbff, 0.65);
      graphics.strokeCircle(x, y, shieldRadius + 4);
      graphics.fillStyle(0x8be7ff, 0.82);
      graphics.fillTriangle(
        x,
        y - shieldRadius - 7,
        x - 6,
        y - shieldRadius + 2,
        x + 6,
        y - shieldRadius + 2,
      );
    }

    if (enemy.slowUntilTick > tick) {
      graphics.lineStyle(2, 0x7de8ff, 0.85);
      graphics.strokeCircle(x, y, largeEnemy ? 33 : 23);
      graphics.fillStyle(0x7de8ff, 0.9);
      graphics.fillTriangle(x, y - 30, x - 5, y - 23, x + 5, y - 23);
      graphics.fillTriangle(x, y - 18, x - 5, y - 25, x + 5, y - 25);
    }

    const radius = largeEnemy ? 29 : enemy.enemyId === "tax-troll" ? 22 : 18;
    const barWidth = largeEnemy ? 66 : enemy.enemyId === "tax-troll" ? 44 : 36;
    graphics.fillStyle(0x1a1118, 0.95);
    graphics.fillRoundedRect(x - barWidth / 2, y - radius - 12, barWidth, 6, 3);
    graphics.fillStyle(enemy.bossPhase ? 0xffb454 : 0x7ee081);
    graphics.fillRoundedRect(
      x - barWidth / 2,
      y - radius - 12,
      Math.max(
        2,
        Math.round(
          (barWidth * Math.min(enemy.health, enemy.maxHealth)) /
            enemy.maxHealth,
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
    const pad = this.level.pads.find(
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
        ? this.level.pads.find((candidate) => candidate.id === tower.padId)
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
          : this.level.path[0];
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
      } else if (event.type === "enemy-referred") {
        const referred = state.enemies.find(
          (enemy) => enemy.id === event.referredInstanceId,
        );
        const position = referred
          ? this.simulation.getEnemyPosition(referred)
          : this.enemySnapshots.get(event.originalInstanceId);
        if (position) {
          effect = {
            x: position.x,
            y: position.y,
            kind: "referral",
            color: 0xa8f0d0,
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
      } else if (effect.kind === "boss-phase" || effect.kind === "referral") {
        const color = effect.kind === "referral" ? 0xa8f0d0 : 0xffb454;
        this.effectsGraphics.lineStyle(6 - progress * 3, color, alpha);
        this.effectsGraphics.strokeCircle(
          effect.x,
          effect.y,
          28 + progress * 74,
        );
        this.effectsGraphics.lineStyle(
          3,
          effect.kind === "referral" ? 0xe0fff4 : 0xfff0a8,
          alpha * 0.8,
        );
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
      paused,
      gameSpeed,
      lowEffects,
      reducedMotion,
      onState,
      onTowerSelected,
      onPlacementPreview,
      onError,
    },
    ref,
  ) {
    const level =
      levelDefinitions[
        simulation.state.levelId as keyof typeof levelDefinitions
      ];
    if (!level) {
      throw new Error(`Unknown battlefield level: ${simulation.state.levelId}`);
    }
    const host = useRef<HTMLDivElement>(null);
    const scene = useRef<BattleScene | null>(null);
    const pausedRef = useRef(paused);
    const padButtons = useRef(new Map<string, HTMLButtonElement>());
    const overlayPrimaryAction = useRef<HTMLButtonElement>(null);
    const previousControlPadId = useRef<string | null>(null);
    const [controls, setControls] =
      useState<CanvasControlState>(EMPTY_CONTROLS);
    const [canvasFrame, setCanvasFrame] = useState<CanvasFrame | null>(null);
    const [pendingTowerAction, setPendingTowerAction] = useState<
      "upgrade" | "sell" | null
    >(null);
    const [towerInfoId, setTowerInfoId] = useState<string | null>(null);
    const callbacks = useRef({
      onState,
      onTowerSelected,
      onPlacementPreview,
      onError,
    });
    callbacks.current = {
      onState,
      onTowerSelected,
      onPlacementPreview,
      onError,
    };
    pausedRef.current = paused;

    useImperativeHandle(ref, () => ({
      dispatch(command) {
        return scene.current?.dispatch(command) ?? false;
      },
      confirmPlacement(preview) {
        return scene.current?.confirmPlacement(preview) ?? false;
      },
      setSpeed(speed) {
        scene.current?.setSpeed(speed);
      },
    }));

    useEffect(() => {
      scene.current?.setSpeed(gameSpeed);
    }, [gameSpeed]);

    useLayoutEffect(() => {
      scene.current?.setPaused(paused);
    }, [paused]);

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
          onError: (message) => callbacks.current.onError(message),
          onControlsChanged: setControls,
        },
        lowEffects,
        reducedMotion,
        managementDisabled,
        placementPreview,
        paused,
      );
      battleScene.setSpeed(gameSpeed);
      let game: Phaser.Game | null = null;
      let canvasObserver: ResizeObserver | null = null;
      const updateCanvasFrame = () => {
        const canvas = game?.canvas;
        if (!canvas) {
          return;
        }
        const battlefieldBounds =
          container.parentElement?.getBoundingClientRect();
        const canvasBounds = canvas.getBoundingClientRect();
        setCanvasFrame({
          left:
            canvasBounds.left - (battlefieldBounds?.left ?? canvasBounds.left),
          top: canvasBounds.top - (battlefieldBounds?.top ?? canvasBounds.top),
          width: canvasBounds.width,
          height: canvasBounds.height,
        });
      };
      const startFrame = window.requestAnimationFrame(() => {
        if (!container.isConnected) {
          return;
        }
        container.replaceChildren();
        battleScene.setPaused(pausedRef.current);
        scene.current = battleScene;
        game = new Phaser.Game({
          type: Phaser.AUTO,
          parent: container,
          width: level.width,
          height: level.height,
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
      ? level.pads.find((pad) => pad.id === controls.wheelPadId)
      : null;
    const selectedTower = controls.selectedTowerInstanceId
      ? simulation.state.towers.find(
          (tower) => tower.id === controls.selectedTowerInstanceId,
        )
      : null;
    const selectedPad = selectedTower
      ? level.pads.find((pad) => pad.id === selectedTower.padId)
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
      ? level.pads.find((pad) => pad.id === placementPreview.padId)
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
            level,
          )
        : [];
    const actionPositions =
      selectedPad && canvasFrame
        ? controlRowPositions(
            selectedPad.position,
            canvasFrame,
            2,
            ACTION_BUTTON_SIZE,
            level,
          )
        : [];
    const placementPositions =
      previewPad && canvasFrame
        ? controlRowPositions(
            previewPad.position,
            canvasFrame,
            2,
            ACTION_BUTTON_SIZE,
            level,
          )
        : [];
    const maxTowerLevel = selectedDefinition
      ? simulation.getTowerMaxLevel(selectedDefinition.id)
      : 0;
    const rankReward = selectedDefinition
      ? Object.values(rewardDefinitions).find(
          (reward) =>
            reward.kind === "tower-rank" &&
            reward.towerId === selectedDefinition.id,
        )
      : undefined;
    const rewardMission = rankReward
      ? campaignNodes.find((node) => node.rewardIds.includes(rankReward.id))
      : undefined;
    const rewardRankLocked = Boolean(
      selectedTower &&
      selectedDefinition &&
      selectedTower.level >= maxTowerLevel &&
      selectedTower.level < selectedDefinition.levels.length,
    );
    const upgradeCost =
      selectedTower && selectedTower.level < maxTowerLevel
        ? (selectedLevel?.upgradeCost ?? null)
        : null;
    const upgradeDetails =
      selectedDefinition && selectedTower
        ? towerUpgradeDescription(selectedDefinition, selectedTower.level)
        : "";
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
    const towerInfo = towerInfoId
      ? towerDefinitions[towerInfoId as keyof typeof towerDefinitions]
      : null;
    const towerInfoUnavailable = Boolean(
      towerInfo && wheelPad && !towerAvailableOnPad(wheelPad, towerInfo.id),
    );

    useEffect(() => {
      setPendingTowerAction(null);
    }, [
      controls.selectedTowerInstanceId,
      managementDisabled,
      simulation.state.phase,
    ]);

    useEffect(() => {
      if (!towerInfoId) {
        return;
      }
      const dismiss = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
          setTowerInfoId(null);
        }
      };
      window.addEventListener("keydown", dismiss);
      return () => window.removeEventListener("keydown", dismiss);
    }, [towerInfoId]);

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
      <div className="battlefield" aria-label={`${level.name} battlefield`}>
        <div className="battlefield-canvas" ref={host} />
        {canvasFrame && (
          <div
            className="battlefield-control-layer battlefield-pad-layer"
            role="group"
            aria-label="Tower pads"
          >
            {level.pads.map((pad) => {
              const tower = towersByPad.get(pad.id);
              const shutdown = padShutdownState(pad, simulation.state);
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
                  className={`battlefield-pad-button ${
                    shutdown ? `is-${shutdown}` : ""
                  } ${
                    pad.allowedTowerIds || pad.deniedTowerIds
                      ? "is-restricted"
                      : ""
                  }`}
                  style={controlStyle(
                    canvasFrame,
                    worldToCanvasPosition(pad.position, canvasFrame, level),
                  )}
                  disabled={
                    !tower && (managementDisabled || shutdown === "active")
                  }
                  tabIndex={canvasControlOpen ? -1 : 0}
                  aria-pressed={
                    controls.wheelPadId === pad.id ||
                    controls.selectedTowerInstanceId === tower?.id
                  }
                  aria-label={
                    shutdown === "active" && !tower
                      ? `${padName(pad.id)} is temporarily shut down`
                      : tower && definition
                        ? `Inspect ${towerChoiceName(definition)} at ${padName(pad.id)}`
                        : `Open hero wheel at ${padName(pad.id)}${
                            pad.allowedTowerIds
                              ? `. Licensed for ${pad.allowedTowerIds
                                  .map(
                                    (towerId) =>
                                      towerDefinitions[
                                        towerId as keyof typeof towerDefinitions
                                      ].name,
                                  )
                                  .join(" or ")}`
                              : ""
                          }${
                            pad.deniedTowerIds
                              ? `. Cannot support ${pad.deniedTowerIds
                                  .map(
                                    (towerId) =>
                                      towerDefinitions[
                                        towerId as keyof typeof towerDefinitions
                                      ].name,
                                  )
                                  .join(" or ")}`
                              : ""
                          }`
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
              const available = towerAvailableOnPad(wheelPad, definition.id);
              return position ? (
                <button
                  key={definition.id}
                  ref={index === 0 ? overlayPrimaryAction : undefined}
                  className={`tower-wheel-button tower-${definition.id} ${
                    available ? "" : "is-unavailable"
                  }`}
                  style={controlStyle(canvasFrame, position)}
                  aria-label={`Preview ${towerChoiceName(definition)}. ${towerTacticalDescription(definition)}${
                    available ? "" : " Unavailable for this pad."
                  }`}
                  aria-disabled={!available}
                  aria-describedby={
                    towerInfoId === definition.id
                      ? "tower-choice-description"
                      : undefined
                  }
                  onPointerEnter={(event) => {
                    if (event.pointerType === "mouse") {
                      setTowerInfoId(definition.id);
                    }
                  }}
                  onPointerLeave={(event) => {
                    if (event.pointerType === "mouse") {
                      setTowerInfoId(null);
                    }
                  }}
                  onFocus={() => setTowerInfoId(definition.id)}
                  onBlur={() => {
                    if (!placementPreview) {
                      setTowerInfoId(null);
                    }
                  }}
                  onClick={() => {
                    setTowerInfoId(definition.id);
                    scene.current?.chooseWheelOption(definition.id);
                  }}
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
        {towerInfo && (wheelPad || placementPreview) && (
          <aside
            id="tower-choice-description"
            className="defender-info-popover tower-choice-popover"
            role="tooltip"
          >
            <span>
              <strong>{towerChoiceName(towerInfo)}</strong>
              <small>
                {towerTacticalDescription(towerInfo)}
                {towerInfoUnavailable
                  ? " Unavailable for this pad; choose another defender."
                  : ""}
              </small>
            </span>
            <button
              type="button"
              onClick={() => setTowerInfoId(null)}
              aria-label="Dismiss defender details"
            >
              ×
            </button>
          </aside>
        )}
        {canvasFrame && placementPreview && previewPad && previewDefinition && (
          <div
            className="battlefield-control-layer"
            role="group"
            aria-label={`${towerChoiceName(previewDefinition)} placement`}
          >
            <span
              className="battlefield-context-label"
              style={controlStyle(
                canvasFrame,
                contextLabelPosition(
                  previewPad.position,
                  placementPositions,
                  canvasFrame,
                  level,
                ),
              )}
            >
              {towerChoiceName(previewDefinition)} · {previewDefinition.cost}g
              {simulation.state.gold < previewDefinition.cost
                ? ` · need ${previewDefinition.cost - simulation.state.gold}g`
                : ""}
            </span>
            <button
              ref={overlayPrimaryAction}
              className="tower-action-button placement-cancel-button"
              style={controlStyle(canvasFrame, placementPositions[0]!)}
              aria-label={`Cancel ${towerChoiceName(previewDefinition)} placement`}
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
              aria-label={`Confirm ${towerChoiceName(previewDefinition)} placement for ${previewDefinition.cost} gold`}
              onClick={() => {
                if (scene.current?.confirmPlacement(placementPreview)) {
                  callbacks.current.onPlacementPreview(null);
                  callbacks.current.onError(
                    `${towerChoiceName(previewDefinition)} deployed.`,
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
              aria-label={`${towerChoiceName(selectedDefinition)} actions`}
            >
              <span
                className="battlefield-context-label"
                style={controlStyle(
                  canvasFrame,
                  contextLabelPosition(
                    selectedPad.position,
                    actionPositions,
                    canvasFrame,
                    level,
                  ),
                )}
              >
                {pendingTowerAction === "upgrade" && upgradeCost !== null
                  ? `Rank ${selectedTower.level + 1}, ${upgradeCost}g: ${upgradeDetails}`
                  : pendingTowerAction === "sell"
                    ? `Sell ${towerChoiceName(selectedDefinition)} for ${sellValue}g?`
                    : `${towerChoiceName(selectedDefinition)} · rank ${selectedTower.level}${
                        rewardRankLocked && rankReward
                          ? ` · next rank unlocks with ${rankReward.name}${
                              rewardMission ? ` from ${rewardMission.name}` : ""
                            }`
                          : ""
                      }`}
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
                      ? `Confirm ${towerChoiceName(selectedDefinition)} upgrade for ${upgradeCost} gold. ${upgradeDetails}`
                      : rewardRankLocked && rankReward
                        ? `${towerChoiceName(selectedDefinition)} rank ${maxTowerLevel + 1} requires ${rankReward.name}${
                            rewardMission ? ` from ${rewardMission.name}` : ""
                          }`
                        : upgradeCost === null
                          ? `${towerChoiceName(selectedDefinition)} is at maximum rank`
                          : `Upgrade ${towerChoiceName(selectedDefinition)} for ${upgradeCost} gold. ${upgradeDetails}`
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
                      ? `Confirm sale of ${towerChoiceName(selectedDefinition)} for ${sellValue} gold`
                      : `Sell ${towerChoiceName(selectedDefinition)} for ${sellValue} gold`
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
