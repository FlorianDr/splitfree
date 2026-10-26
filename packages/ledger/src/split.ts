import type { Cents, SplitMode } from "./types.ts";

export interface SplitInput {
  totalCents: Cents;
  /** Canonical order — used for deterministic remainder distribution. */
  participantIds: string[];
  mode: SplitMode;
  /** For 'shares': positive weight per participant. */
  weights?: Record<string, number>;
  /** For 'percent': percentages per participant, must sum to 100. */
  percent?: Record<string, number>;
  /** For 'exact': exact cents per participant, must sum to totalCents. */
  exactCents?: Record<string, Cents>;
}

/** Tolerance for float percent inputs summing to 100. */
const PERCENT_EPSILON = 1e-9;

function assertIntegerCents(value: Cents, label: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, got ${value}`);
  }
}

/**
 * Allocate `totalCents` across `participantIds` according to `mode`.
 *
 * For equal/shares/percent the largest-remainder (Hamilton) method is used so
 * the returned amounts always sum to exactly `totalCents`. For exact, the caller
 * supplied amounts are validated and returned as-is.
 */
export function allocateOwed(input: SplitInput): Record<string, Cents> {
  const { totalCents, participantIds, mode } = input;

  if (participantIds.length === 0) {
    throw new Error("allocateOwed: participantIds must not be empty");
  }
  const seen = new Set<string>();
  for (const id of participantIds) {
    if (seen.has(id)) {
      throw new Error(`allocateOwed: duplicate participant id "${id}"`);
    }
    seen.add(id);
  }
  assertIntegerCents(totalCents, "totalCents");

  if (mode === "exact") {
    return allocateExact(totalCents, participantIds, input.exactCents);
  }

  const weights = resolveWeights(mode, participantIds, input);
  return largestRemainder(totalCents, participantIds, weights);
}

function allocateExact(
  totalCents: Cents,
  participantIds: string[],
  exactCents: Record<string, Cents> | undefined,
): Record<string, Cents> {
  if (exactCents === undefined) {
    throw new Error("allocateOwed: 'exact' mode requires exactCents");
  }
  const keys = Object.keys(exactCents);
  if (keys.length !== participantIds.length) {
    throw new Error(
      "allocateOwed: exactCents must cover exactly the participantIds",
    );
  }
  const result: Record<string, Cents> = {};
  let total = 0;
  for (const id of participantIds) {
    const value = exactCents[id];
    if (value === undefined) {
      throw new Error(`allocateOwed: exactCents missing participant "${id}"`);
    }
    assertIntegerCents(value, `exactCents["${id}"]`);
    result[id] = value;
    total += value;
  }
  if (total !== totalCents) {
    throw new Error(
      `allocateOwed: exactCents sum ${total} !== totalCents ${totalCents}`,
    );
  }
  return result;
}

/** Resolve a positive weight per participant for equal/shares/percent modes. */
function resolveWeights(
  mode: SplitMode,
  participantIds: string[],
  input: SplitInput,
): number[] {
  if (mode === "equal") {
    return participantIds.map(() => 1);
  }

  if (mode === "shares") {
    const { weights } = input;
    if (weights === undefined) {
      throw new Error("allocateOwed: 'shares' mode requires weights");
    }
    return participantIds.map((id) => {
      const w = weights[id];
      if (w === undefined || !(w > 0)) {
        throw new Error(
          `allocateOwed: 'shares' weight for "${id}" must be > 0`,
        );
      }
      return w;
    });
  }

  // mode === "percent"
  const { percent } = input;
  if (percent === undefined) {
    throw new Error("allocateOwed: 'percent' mode requires percent");
  }
  let totalPercent = 0;
  const weights = participantIds.map((id) => {
    const p = percent[id];
    if (p === undefined) {
      throw new Error(`allocateOwed: 'percent' missing participant "${id}"`);
    }
    if (!(p >= 0)) {
      throw new Error(`allocateOwed: 'percent' for "${id}" must be >= 0`);
    }
    totalPercent += p;
    return p;
  });
  if (Math.abs(totalPercent - 100) > PERCENT_EPSILON) {
    throw new Error(
      `allocateOwed: percent values must sum to 100, got ${totalPercent}`,
    );
  }
  return weights;
}

/**
 * Largest-remainder (Hamilton) apportionment.
 *
 * ideal_i = totalCents * weight_i / sumWeights. Each participant gets
 * floor(ideal_i); the leftover r = totalCents - Σfloor cents are handed out one
 * each to the participants with the largest fractional remainder. Ties are
 * broken by the original order in `participantIds`, so the result is fully
 * deterministic. By construction Σ result === totalCents exactly.
 */
function largestRemainder(
  totalCents: Cents,
  participantIds: string[],
  weights: number[],
): Record<string, Cents> {
  // Invariant: resolveWeights guarantees sumWeights > 0 for every mode
  // (equal -> all 1s, shares -> each > 0, percent -> sums to 100), so no division
  // by zero is possible below.
  let sumWeights = 0;
  for (const w of weights) {
    sumWeights += w;
  }

  const floors: number[] = [];
  // remainder numerator scaled by sumWeights so we compare with integers:
  // fractional part of ideal_i = (totalCents * weight_i mod sumWeights) / sumWeights
  const remainders: number[] = [];
  let allocated = 0;
  for (let i = 0; i < participantIds.length; i++) {
    const weight = weights[i] ?? 0;
    const scaled = totalCents * weight;
    const floor = Math.floor(scaled / sumWeights);
    floors[i] = floor;
    remainders[i] = scaled - floor * sumWeights;
    allocated += floor;
  }

  // Math.floor always leaves remainders in [0, sumWeights), so the leftover is
  // always in [0, n) — including for negative totals, where the floors simply
  // round more-negative and leftover stays non-negative.
  const leftover = totalCents - allocated;

  // Distribute leftover cents to the largest remainders, ties broken by index.
  const order = participantIds.map((_, i) => i);
  order.sort((a, b) => {
    const ra = remainders[a] ?? 0;
    const rb = remainders[b] ?? 0;
    if (rb !== ra) {
      return rb - ra;
    }
    return a - b;
  });

  const result: Record<string, Cents> = {};
  for (let i = 0; i < participantIds.length; i++) {
    const id = participantIds[i] ?? "";
    result[id] = floors[i] ?? 0;
  }
  for (let k = 0; k < leftover; k++) {
    const idx = order[k] ?? 0;
    const id = participantIds[idx] ?? "";
    result[id] = (result[id] ?? 0) + 1;
  }
  return result;
}
