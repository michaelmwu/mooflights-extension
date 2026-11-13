// Firefox's optional data consent supplements the same in-product opt-in used
// on Chrome and older Firefox releases. Never request it before a user action.
export const COMMUNITY_DATA_PERMISSIONS = ["websiteContent", "searchTerms", "technicalAndInteraction"];

type DataPermissions = chrome.permissions.Permissions & { data_collection?: string[] };
type FirefoxPermissions = { getAll: () => Promise<{ data_collection?: string[] }> };

export async function supportsNativeDataConsent(): Promise<boolean> {
  const browser = (globalThis as typeof globalThis & { browser?: { permissions?: FirefoxPermissions } }).browser;
  if (!browser?.permissions) return false;
  const granted = await browser.permissions.getAll();
  return Array.isArray(granted.data_collection);
}

export function communityPermissions(baseUrl: string, nativeDataConsent: boolean): DataPermissions {
  return {
    origins: [`${baseUrl}/*`],
    ...(nativeDataConsent ? { data_collection: [...COMMUNITY_DATA_PERMISSIONS] } : {}),
  };
}

export async function hasCommunityPermission(baseUrl: string): Promise<boolean> {
  return chrome.permissions.contains(communityPermissions(baseUrl, await supportsNativeDataConsent()));
}
