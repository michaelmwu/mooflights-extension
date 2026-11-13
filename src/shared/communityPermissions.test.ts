import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COMMUNITY_DATA_PERMISSIONS,
  communityPermissions,
  hasCommunityPermission,
  supportsNativeDataConsent,
} from "./communityPermissions";

afterEach(() => vi.unstubAllGlobals());

describe("community data permissions", () => {
  it("keeps the host-only consent path for Chrome and older Firefox", async () => {
    vi.stubGlobal("browser", undefined);
    expect(await supportsNativeDataConsent()).toBe(false);
    vi.stubGlobal("browser", { permissions: { getAll: async () => ({ origins: [] }) } });
    expect(await supportsNativeDataConsent()).toBe(false);
    expect(communityPermissions("https://app.mooflights.com", false)).toEqual({
      origins: ["https://app.mooflights.com/*"],
    });
  });

  it("requires all optional collection scopes on supported Firefox", async () => {
    vi.stubGlobal("browser", { permissions: { getAll: async () => ({ data_collection: [] }) } });
    const contains = vi.fn().mockResolvedValue(false);
    vi.stubGlobal("chrome", { permissions: { contains } });
    expect(await hasCommunityPermission("https://app.mooflights.com")).toBe(false);
    expect(contains).toHaveBeenCalledWith({
      origins: ["https://app.mooflights.com/*"],
      data_collection: COMMUNITY_DATA_PERMISSIONS,
    });
  });
});
