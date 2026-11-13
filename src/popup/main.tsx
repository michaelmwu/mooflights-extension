import "../shared/firefoxChromeCompat";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { communityPermissions, supportsNativeDataConsent } from "../shared/communityPermissions";
import {
  COMMUNITY_CONSENT_VERSION,
  COMMUNITY_PROMPT_KEY,
  DEFAULT_HISTORY_API_ORIGIN,
  historyBaseUrl,
} from "../shared/communitySettings";
import { createTranslator, htmlLang } from "../shared/i18n";
import { LOCAL_PROVIDERS } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings, mergeSettings, patchSettings, SETTINGS_KEY } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import { CommunityIcon } from "../ui/CommunityIcon";
import "./popup.css";
import "../ui/communityConsent.css";

const PROVIDER_LABELS = new Map(LOCAL_PROVIDERS.map((provider) => [provider.id, provider.label]));

function Popup(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [promptDecision, setPromptDecision] = useState<string | null>(null);
  const [nativeDataConsent, setNativeDataConsent] = useState<boolean | null>(null);
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
    promptDecision !== null &&
    promptDecision !== COMMUNITY_CONSENT_VERSION &&
    !settings.communityHistory.enabled &&
    settings.communityHistory.consentVersion !== COMMUNITY_CONSENT_VERSION;

  return (
    <main aria-busy={settingsLoading}>
      <header>
        <h1>{t("appName")}</h1>
        <p>{t("popupTagline")}</p>
      </header>

      <section>
        <dl>
          <div>
            <dt>{t("backend")}</dt>
            <dd>{settings.backend.enabled ? t("enabled") : t("localOnly")}</dd>
          </div>
          <div>
            <dt>{t("preferredLinks")}</dt>
            <dd>{preferredProviderSummary(settings.preferredProviderIds, t)}</dd>
          </div>
        </dl>
      </section>

      <section className="actions">
        <button type="button" onClick={() => chrome.tabs.create({ url: "https://matrix.itasoftware.com/" })}>
          {t("openItaMatrix")}
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => chrome.runtime.sendMessage({ command: "openOptionsPage" })}
        >
          {t("options")}
        </button>
      </section>

      {showPrompt && (
        <section className="community-card community-prompt" aria-labelledby="community-prompt-heading">
          <div className="community-heading">
            <CommunityIcon />
            <h2 id="community-prompt-heading">{t("historyPromptTitle")}</h2>
          </div>
          <p className="community-description">{t("historyNote")}</p>
          <p className="community-retention">{t("historyRetainedStatistics")}</p>
          <div className="community-prompt-actions">
            <button type="button" disabled={sharingBusy} onClick={() => void enableSharing()}>
              {t("historyEnable")}
            </button>
            <button type="button" className="secondary" disabled={sharingBusy} onClick={() => void dismissPrompt()}>
              {t("historyDecline")}
            </button>
          </div>
          <div className="community-footer">
            <a
              href="https://github.com/michaelmwu/mooflights-extension/blob/main/PRIVACY.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("historyDetails")}
            </a>
          </div>
          <p className="community-optional">{t("historyOptional")}</p>
          {sharingError && (
            <p className="community-message" role="status">
              {sharingError}
            </p>
          )}
        </section>
      )}
    </main>
  );
}

function preferredProviderSummary(providerIds: string[], t: ReturnType<typeof createTranslator>): string {
  const labels = providerIds.map((providerId) => PROVIDER_LABELS.get(providerId) || providerId);
  if (labels.length === 0) return t("defaultRanking");
  if (labels.length <= 2) return labels.join(", ");
  return t("preferredProviderSummaryMore", {
    providers: labels.slice(0, 2).join(", "),
    count: labels.length - 2,
  });
}

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
