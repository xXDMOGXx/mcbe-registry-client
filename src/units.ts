/** Base units in one bucket (1000 mB). */
export const BUCKET = 3000;

/** Base units in one bottle (⅓ bucket). */
export const BOTTLE = 1000;

/** Whole millibuckets to base units (`n * 3`). */
export function mb(n: number): number {
  return n * 3;
}

/** Base units to whole millibuckets (integer divide). */
export function toMb(amount: number): number {
  return Math.floor(amount / 3);
}
