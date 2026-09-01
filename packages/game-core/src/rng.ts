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
}
