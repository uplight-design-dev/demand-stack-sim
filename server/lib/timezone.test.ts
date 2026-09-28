import { describe, expect, it } from "vitest";
import { hoursInLocalDay, isDstTransitionDay, localDateOf, localHourOf, utcToLocalIso } from "./timezone.js";

describe("timezone", () => {
  it("converts a UTC timestamp to local ISO with the correct offset", () => {
    // 2025-07-04T22:00:00Z is 6:00 pm EDT (UTC-4) in New York.
    const local = utcToLocalIso("2025-07-04T22:00:00Z", "America/New_York");
    expect(local).toBe("2025-07-04T18:00:00-04:00");
  });

  it("converts a UTC timestamp to local ISO across the winter offset", () => {
    // 2025-01-24T23:00:00Z is 6:00 pm EST (UTC-5) in New York.
    const local = utcToLocalIso("2025-01-24T23:00:00Z", "America/New_York");
    expect(local).toBe("2025-01-24T18:00:00-05:00");
  });

  it("never treats UTC as local -- offsets differ between summer and winter", () => {
    const summer = utcToLocalIso("2025-07-04T12:00:00Z", "America/New_York");
    const winter = utcToLocalIso("2025-01-04T12:00:00Z", "America/New_York");
    expect(summer.slice(11, 19)).not.toBe(winter.slice(11, 19));
  });

  it("computes the correct local hour", () => {
    expect(localHourOf("2025-07-04T22:00:00Z", "America/New_York")).toBe(18);
  });

  it("computes the correct local date, including a UTC-date rollover", () => {
    // 11pm PT on Jan 1 is 7am UTC on Jan 2.
    expect(localDateOf("2025-01-02T07:00:00Z", "America/Los_Angeles")).toBe("2025-01-01");
  });

  it("detects a normal 24-hour day", () => {
    expect(hoursInLocalDay("2025-07-15", "America/New_York")).toBe(24);
    expect(isDstTransitionDay("2025-07-15", "America/New_York")).toBe(false);
  });

  it("detects a 23-hour spring-forward day", () => {
    // US DST began 2025-03-09.
    expect(hoursInLocalDay("2025-03-09", "America/New_York")).toBe(23);
    expect(isDstTransitionDay("2025-03-09", "America/New_York")).toBe(true);
  });

  it("detects a 25-hour fall-back day", () => {
    // US DST ended 2025-11-02.
    expect(hoursInLocalDay("2025-11-02", "America/New_York")).toBe(25);
    expect(isDstTransitionDay("2025-11-02", "America/New_York")).toBe(true);
  });

  it("handles a timezone with no DST (Arizona) as always 24 hours", () => {
    expect(hoursInLocalDay("2025-03-09", "America/Phoenix")).toBe(24);
    expect(isDstTransitionDay("2025-03-09", "America/Phoenix")).toBe(false);
  });

  it("throws on an invalid UTC timestamp rather than silently misinterpreting it", () => {
    expect(() => utcToLocalIso("not-a-date", "America/New_York")).toThrow();
  });
});
