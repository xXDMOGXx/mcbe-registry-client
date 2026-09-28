import { describe, expect, it } from "vitest";
import { BOTTLE, BUCKET, mb, toMb } from "./units.js";

describe("fluid units", () => {
  it("keeps three bottles equal to one bucket", () => {
    expect(3 * BOTTLE).toBe(BUCKET);
  });

  it("converts whole millibuckets with mb()", () => {
    expect(mb(50)).toBe(150);
    expect(mb(1000)).toBe(BUCKET);
  });

  it("converts base units back to millibuckets with toMb()", () => {
    expect(toMb(BUCKET)).toBe(1000);
    expect(toMb(3 * BOTTLE)).toBe(1000);
  });
});
