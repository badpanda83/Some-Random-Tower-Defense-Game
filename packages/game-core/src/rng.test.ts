import { describe, expect, it } from "vitest";

import { SeededRandom } from "./rng.js";

describe("SeededRandom", () => {
  it("repeats a sequence for the same seed", () => {
    const left = new SeededRandom(42);
    const right = new SeededRandom(42);

    expect(Array.from({ length: 20 }, () => left.nextUint32())).toEqual(
      Array.from({ length: 20 }, () => right.nextUint32()),
    );
  });

  it("rejects invalid bounds", () => {
    expect(() => new SeededRandom(1).int(0)).toThrow(RangeError);
  });
});
