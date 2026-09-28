import type { StateInfo } from "../../../shared/types/energy.js";

// All 50 states + DC. IANA timezones; `primaryTimezone` is used whenever a
// single value is needed (e.g. picking a default BA/profile), `timezones`
// lists every zone the state's territory actually touches so callers can be
// honest about states that span more than one (AK, FL, ID, KY, MI, ND, NE,
// OR, TN, TX all cross a zone boundary somewhere in their territory).
export const STATES: StateInfo[] = [
  { name: "Alabama", abbr: "AL", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Alaska", abbr: "AK", timezones: ["America/Anchorage", "America/Adak"], primaryTimezone: "America/Anchorage" },
  { name: "Arizona", abbr: "AZ", timezones: ["America/Phoenix"], primaryTimezone: "America/Phoenix" },
  { name: "Arkansas", abbr: "AR", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "California", abbr: "CA", timezones: ["America/Los_Angeles"], primaryTimezone: "America/Los_Angeles" },
  { name: "Colorado", abbr: "CO", timezones: ["America/Denver"], primaryTimezone: "America/Denver" },
  { name: "Connecticut", abbr: "CT", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Delaware", abbr: "DE", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "District of Columbia", abbr: "DC", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Florida", abbr: "FL", timezones: ["America/New_York", "America/Chicago"], primaryTimezone: "America/New_York" },
  { name: "Georgia", abbr: "GA", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Hawaii", abbr: "HI", timezones: ["Pacific/Honolulu"], primaryTimezone: "Pacific/Honolulu" },
  { name: "Idaho", abbr: "ID", timezones: ["America/Denver", "America/Los_Angeles"], primaryTimezone: "America/Denver" },
  { name: "Illinois", abbr: "IL", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Indiana", abbr: "IN", timezones: ["America/Indiana/Indianapolis", "America/Chicago"], primaryTimezone: "America/Indiana/Indianapolis" },
  { name: "Iowa", abbr: "IA", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Kansas", abbr: "KS", timezones: ["America/Chicago", "America/Denver"], primaryTimezone: "America/Chicago" },
  { name: "Kentucky", abbr: "KY", timezones: ["America/New_York", "America/Chicago"], primaryTimezone: "America/New_York" },
  { name: "Louisiana", abbr: "LA", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Maine", abbr: "ME", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Maryland", abbr: "MD", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Massachusetts", abbr: "MA", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Michigan", abbr: "MI", timezones: ["America/Detroit", "America/Chicago"], primaryTimezone: "America/Detroit" },
  { name: "Minnesota", abbr: "MN", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Mississippi", abbr: "MS", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Missouri", abbr: "MO", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Montana", abbr: "MT", timezones: ["America/Denver"], primaryTimezone: "America/Denver" },
  { name: "Nebraska", abbr: "NE", timezones: ["America/Chicago", "America/Denver"], primaryTimezone: "America/Chicago" },
  { name: "Nevada", abbr: "NV", timezones: ["America/Los_Angeles"], primaryTimezone: "America/Los_Angeles" },
  { name: "New Hampshire", abbr: "NH", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "New Jersey", abbr: "NJ", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "New Mexico", abbr: "NM", timezones: ["America/Denver"], primaryTimezone: "America/Denver" },
  { name: "New York", abbr: "NY", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "North Carolina", abbr: "NC", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "North Dakota", abbr: "ND", timezones: ["America/Chicago", "America/Denver"], primaryTimezone: "America/Chicago" },
  { name: "Ohio", abbr: "OH", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Oklahoma", abbr: "OK", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Oregon", abbr: "OR", timezones: ["America/Los_Angeles", "America/Denver"], primaryTimezone: "America/Los_Angeles" },
  { name: "Pennsylvania", abbr: "PA", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Rhode Island", abbr: "RI", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "South Carolina", abbr: "SC", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "South Dakota", abbr: "SD", timezones: ["America/Chicago", "America/Denver"], primaryTimezone: "America/Chicago" },
  { name: "Tennessee", abbr: "TN", timezones: ["America/New_York", "America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Texas", abbr: "TX", timezones: ["America/Chicago", "America/Denver"], primaryTimezone: "America/Chicago" },
  { name: "Utah", abbr: "UT", timezones: ["America/Denver"], primaryTimezone: "America/Denver" },
  { name: "Vermont", abbr: "VT", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Virginia", abbr: "VA", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Washington", abbr: "WA", timezones: ["America/Los_Angeles"], primaryTimezone: "America/Los_Angeles" },
  { name: "West Virginia", abbr: "WV", timezones: ["America/New_York"], primaryTimezone: "America/New_York" },
  { name: "Wisconsin", abbr: "WI", timezones: ["America/Chicago"], primaryTimezone: "America/Chicago" },
  { name: "Wyoming", abbr: "WY", timezones: ["America/Denver"], primaryTimezone: "America/Denver" }
];

export const STATE_BY_ABBR: Record<string, StateInfo> = Object.fromEntries(
  STATES.map((s) => [s.abbr, s])
);
