import { flagEmoji } from "./flags";

describe("flag helpers", () => {
  it("formats two-letter country codes as regional indicator flags", () => {
    expect(flagEmoji("jp")).toBe("🇯🇵");
    expect(flagEmoji("US")).toBe("🇺🇸");
  });

  it("ignores non-country-code values", () => {
    expect(flagEmoji("USA")).toBe("");
    expect(flagEmoji("1A")).toBe("");
  });
});
