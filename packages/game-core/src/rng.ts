export class SeededRandom {
  private value: number;

  public constructor(seed: number) {
    this.value = seed | 0;
    if (this.value === 0) {
      this.value = 0x6d2b79f5;
    }
  }

  public nextUint32(): number {
    let next = this.value;
    next ^= next << 13;
    next ^= next >>> 17;
    next ^= next << 5;
    this.value = next | 0;
    return next >>> 0;
  }

  public int(maxExclusive: number): number {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be a positive integer");
    }

    return this.nextUint32() % maxExclusive;
  }

  public get state(): number {
    return this.value >>> 0;
  }
}

function mixSeed(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x21f0aaad);
  value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
  value ^= value >>> 15;
  return value === 0 ? 0x6d2b79f5 : value >>> 0;
}

export function deriveBattleRngStates(seed: number): {
  readonly spawn: number;
  readonly combat: number;
} {
  return {
    spawn: mixSeed(seed, 0x53504157),
    combat: mixSeed(seed, 0x434f4d42),
  };
}
