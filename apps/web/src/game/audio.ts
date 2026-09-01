import type { GameEvent } from "@srtg/game-core";

export class GameAudio {
  private context: AudioContext | null = null;

  public constructor(private muted: boolean) {}

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public play(events: readonly GameEvent[]): void {
    if (this.muted || events.length === 0) {
      return;
    }

    this.context ??= new AudioContext();
    if (this.context.state === "suspended") {
      void this.context.resume();
    }

    for (const event of events) {
      switch (event.type) {
        case "tower-attacked":
          this.tone(event.towerId === "bardbarian" ? 330 : 510, 0.025, 0.025);
          break;
        case "enemy-defeated":
          this.tone(180, 0.045, 0.035);
          break;
        case "enemy-leaked":
          this.tone(92, 0.16, 0.08);
          break;
        case "boss-phase":
          this.tone(74, 0.3, 0.1);
          break;
        case "wave-complete":
          this.tone(620, 0.14, 0.04);
          break;
        case "battle-complete":
          this.tone(event.result === "victory" ? 740 : 110, 0.38, 0.08);
          break;
        case "enemy-spawned":
          break;
      }
    }
  }

  public async close(): Promise<void> {
    const context = this.context;
    this.context = null;
    if (context && context.state !== "closed") {
      await context.close();
    }
  }

  private tone(frequency: number, duration: number, volume: number): void {
    const context = this.context;
    if (!context) {
      return;
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(
      Math.max(40, frequency * 0.75),
      now + duration,
    );
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }
}
