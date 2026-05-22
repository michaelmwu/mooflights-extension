import { DEFAULT_SETTINGS, mergeSettings } from "./storage";

describe("settings", () => {
  it("merges partial stored settings with safe defaults", () => {
    expect(
      mergeSettings({
        affiliateOptOut: true,
        backend: {
          enabled: true,
        },
      }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      affiliateOptOut: true,
      backend: {
        ...DEFAULT_SETTINGS.backend,
        enabled: true,
      },
    });
  });
});
