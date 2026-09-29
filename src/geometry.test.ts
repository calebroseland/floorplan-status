import { describe, expect, it } from "vitest";
import { GRID, snap } from "./geometry";

describe("snap", () => {
  it("rounds to the nearest grid step when snapping is on", () => {
    expect(snap(GRID * 3 + 4, true)).toBe(GRID * 3);
    expect(snap(GRID * 3 - 4, true)).toBe(GRID * 3);
  });

  it("keeps one decimal of precision when snapping is off", () => {
    expect(snap(12.34, false)).toBe(12.3);
    expect(snap(12.36, false)).toBe(12.4);
  });
});
