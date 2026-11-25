import "../shared/firefoxChromeCompat";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  communityPermissions,
  hasCommunityPermission,
  supportsNativeDataConsent,
} from "../shared/communityPermissions";
import {
  COMMUNITY_CONSENT_VERSION,
  COMMUNITY_PROMPT_KEY,
  DEFAULT_HISTORY_API_ORIGIN,
  historyBaseUrl,
} from "../shared/communitySettings";
import { createTranslator, htmlLang } from "../shared/i18n";
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, patchSettings, SETTINGS_KEY } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import { CommunityIcon } from "../ui/CommunityIcon";
import { FLIGHT_SITES, readActiveFlightTab, requestPanelStatus, type SupportedTab } from "./tabContext";
import "./popup.css";
import "../ui/communityConsent.css";

const PRIVACY_URL = "https://github.com/michaelmwu/mooflights-extension/blob/main/PRIVACY.md";
const ISSUES_URL = "https://github.com/michaelmwu/mooflights-extension/issues/new";

function Popup(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [promptDecision, setPromptDecision] = useState<string | null>(null);
  const [nativeDataConsent, setNativeDataConsent] = useState<boolean | null>(null);
  const [flightTab, setFlightTab] = useState<SupportedTab | null>();
  const [sharingAvailable, setSharingAvailable] = useState<boolean | null>(null);
  const [showingPanel, setShowingPanel] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingError, setSharingError] = useState("");
  const t = useMemo(() => createTranslator(settings.language), [settings.language]);

  useEffect(() => {
    let active = true;
    let settingsChanged = false;
    let decisionChanged = false;
    void Promise.all([
      loadSettings(),
      chrome.storage.local.get(COMMUNITY_PROMPT_KEY),
      supportsNativeDataConsent().catch(() => null),
    ])
      .then(([nextSettings, stored, nativeConsent]) => {
        if (!active) return;
        if (!settingsChanged) setSettings(nextSettings);
        setNativeDataConsent(nativeConsent);
        if (!decisionChanged)
          setPromptDecision(
            nativeConsent === null
              ? null
              : typeof stored[COMMUNITY_PROMPT_KEY] === "string"
                ? stored[COMMUNITY_PROMPT_KEY]
                : "",
          );
      })
      .catch(() => {
        /* The popup's local tools remain available if consent state cannot load. */
      })
      .finally(() => {
        if (active) setSettingsLoading(false);
      });

    function handleStorageChange(changes: Record<string, chrome.storage.StorageChange>, areaName: string): void {
      if (areaName !== "local") return;
      if (changes[COMMUNITY_PROMPT_KEY]) {
        decisionChanged = true;
        const decision = changes[COMMUNITY_PROMPT_KEY].newValue;
        setPromptDecision(typeof decision === "string" ? decision : "");
      }
      if (changes[SETTINGS_KEY]) {
        settingsChanged = true;
        setSettings(mergeSettings(changes[SETTINGS_KEY].newValue));
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      active = false;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = htmlLang(settings.language);
  }, [settings.language]);

  useEffect(() => {
    let active = true;
    void readActiveFlightTab()
      .catch(() => null)
      .then((tab) => {
        if (active) setFlightTab(tab);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let permissionCheck = 0;
    function updatePermission(): void {
      const check = ++permissionCheck;
      const { enabled, baseUrl } = settings.communityHistory;
      setSharingAvailable(null);
      void (enabled && baseUrl ? hasCommunityPermission(baseUrl) : Promise.resolve(false))
        .catch(() => false)
        .then((allowed) => {
          if (active && check === permissionCheck) setSharingAvailable(allowed);
        });
    }
    updatePermission();
    chrome.permissions.onAdded.addListener(updatePermission);
    chrome.permissions.onRemoved.addListener(updatePermission);
    return () => {
      active = false;
      chrome.permissions.onAdded.removeListener(updatePermission);
      chrome.permissions.onRemoved.removeListener(updatePermission);
    };
  }, [settings.communityHistory]);

  async function showPanel(tab: SupportedTab): Promise<void> {
    setShowingPanel(true);
    try {
      const status = await requestPanelStatus(tab.id, "showToolbarPanel");
      setFlightTab({ ...tab, status });
    } catch {
      setFlightTab({ ...tab, status: "unavailable" });
    } finally {
      setShowingPanel(false);
    }
  }

  async function pauseSharing(): Promise<void> {
    setSharingBusy(true);
    setSharingError("");
    try {
      const current = await loadSettings();
      setSettings(
        await patchSettings({
          communityHistory: { ...current.communityHistory, enabled: false },
        }),
      );
    } catch {
      setSharingError(t("historyOptOutFailed"));
    } finally {
      setSharingBusy(false);
    }
  }

  async function dismissPrompt(): Promise<void> {
    try {
      await chrome.storage.local.set({ [COMMUNITY_PROMPT_KEY]: COMMUNITY_CONSENT_VERSION });
      setPromptDecision(COMMUNITY_CONSENT_VERSION);
    } catch {
      setSharingError(t("historySaveFailed"));
    }
  }

  async function enableSharing(): Promise<void> {
    const baseUrl = historyBaseUrl(settings.communityHistory.baseUrl || DEFAULT_HISTORY_API_ORIGIN);
    setSharingBusy(true);
    setSharingError("");
    try {
      // Keep the permission request in the click handler for Firefox user activation.
      const granted = await chrome.permissions.request(communityPermissions(baseUrl, nativeDataConsent === true));
      if (!granted) {
        setSharingError(t("historyPermissionDenied"));
        return;
      }
      const resumed = await chrome.runtime.sendMessage({ command: "resumeHistorySharing", baseUrl });
      if (!resumed?.ok) throw new Error("Could not resume sharing.");
      const next = await patchSettings({
        communityHistory: { enabled: true, consentVersion: COMMUNITY_CONSENT_VERSION, baseUrl },
      });
      setSettings(next);
      await dismissPrompt();
    } catch {
      setSharingError(t("historyPermissionDenied"));
    } finally {
      setSharingBusy(false);
    }
  }

  const showPrompt =
    !settingsLoading &&
    nativeDataConsent !== null &&
    promptDecision === "" &&
    !settings.communityHistory.enabled &&
    settings.communityHistory.consentVersion !== COMMUNITY_CONSENT_VERSION;

  return (
    <main aria-busy={settingsLoading}>
      <header>
        <img src="../assets/extension-icons/icon-64.png" alt="" width="32" height="32" />
        <div>
          <h1>{t("appName")}</h1>
          <p>{t("popupTagline")}</p>
        </div>
      </header>

      {flightTab !== undefined && (
        <section className="tab-context" aria-live="polite">
          {flightTab ? (
            <>
              <strong>
                {flightTab.status === "active" || flightTab.status === "hidden"
                  ? t("popupActiveSite", { site: flightTab.site })
                  : flightTab.site}
              </strong>
              {flightTab.status === "hidden" && (
                <button type="button" disabled={showingPanel} onClick={() => void showPanel(flightTab)}>
                  {t("popupShowPanel")}
                </button>
              )}
              {flightTab.status === "waiting" && <p>{t("popupRunSearch")}</p>}
              {flightTab.status === "unavailable" && <p>{t("popupReloadTab")}</p>}
            </>
          ) : (
            <>
              <strong>{t("popupOpenFlightSearch")}</strong>
              <div className="site-links">
                {FLIGHT_SITES.map(({ name, url }) => (
                  <a key={name} href={url} target="_blank" rel="noreferrer">
                    {name}
                  </a>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {showPrompt && (
        <section className="community-card community-prompt" aria-labelledby="community-prompt-heading">
          <div className="community-heading">
            <CommunityIcon />
            <h2 id="community-prompt-heading">{t("historyPromptTitle")}</h2>
          </div>
          <p className="community-description">{t("historyPromptBenefits")}</p>
          <p className="community-disclosure">{t("historyPromptDisclosure")}</p>
          <div className="community-prompt-actions">
            <button type="button" disabled={sharingBusy} onClick={() => void enableSharing()}>
              {t("historyEnable")}
            </button>
            <button type="button" className="secondary" disabled={sharingBusy} onClick={() => void dismissPrompt()}>
              {t("historyDecline")}
            </button>
          </div>
          <div className="community-footer">
            <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
              {t("historyDetails")}
            </a>
          </div>
          {sharingError && (
            <p className="community-message" role="status">
              {sharingError}
            </p>
          )}
        </section>
      )}

      {!settingsLoading && !showPrompt && sharingAvailable !== null && (
        <section className="sharing-status" aria-live="polite">
          <div>
            <span>{t(sharingAvailable ? "historySharingOn" : "historySharingOff")}</span>
            {settings.communityHistory.enabled && (
              <button type="button" className="text-button" disabled={sharingBusy} onClick={() => void pauseSharing()}>
                {t("popupPauseSharing")}
              </button>
            )}
          </div>
          {sharingError && (
            <p className="community-message" role="status">
              {sharingError}
            </p>
          )}
        </section>
      )}

      <footer>
        <button
          type="button"
          className="text-button"
          onClick={() => void chrome.runtime.sendMessage({ command: "openOptionsPage" })}
        >
          {t("options")}
        </button>
        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
          {t("popupPrivacy")}
        </a>
        <a href={ISSUES_URL} target="_blank" rel="noreferrer">
          {t("popupReportIssue")}
        </a>
        <span className="version">v{chrome.runtime.getManifest().version}</span>
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
