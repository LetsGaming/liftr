import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatClockLong,
  formatDateLong,
  formatDurationMinutes,
  formatPace,
} from "../../../packages/client/src/lib/format";

describe("formatClock", () => {
  it("formats sub-minute and multi-minute durations as m:ss", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(95)).toBe("1:35");
  });
});

describe("formatClockLong", () => {
  it("matches formatClock under an hour", () => {
    expect(formatClockLong(95)).toBe(formatClock(95));
  });

  it("rolls over to h:mm:ss past an hour", () => {
    expect(formatClockLong(3661)).toBe("1:01:01");
  });

  it("rounds fractional seconds before splitting", () => {
    expect(formatClockLong(3599.6)).toBe("1:00:00");
  });
});

describe("formatPace", () => {
  it("formats seconds/km as mm:ss/km", () => {
    expect(formatPace(330)).toBe("5:30/km");
  });

  it("renders an em dash for unknown pace", () => {
    expect(formatPace(null)).toBe("–");
  });
});

describe("formatDurationMinutes", () => {
  it("rounds seconds to the nearest whole minute", () => {
    expect(formatDurationMinutes(90)).toBe("2 min");
    expect(formatDurationMinutes(89)).toBe("1 min");
  });
});

describe("formatDateLong", () => {
  it("formats an ISO date as a German long date", () => {
    expect(formatDateLong("2026-09-16T12:00:00.000Z")).toMatch(/^16\. September 2026$/);
  });
});
