import type React from "react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LOCAL_PROVIDERS } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import "./popup.css";

const PROVIDER_LABELS = new Map(LOCAL_PROVIDERS.map((provider) => [provider.id, provider.label]));

function Popup(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  return (
    <main>
      <header>
        <h1>Mu Travel Flights</h1>
        <p>Offline-first ITA Matrix tools.</p>
      </header>

      <section>
        <dl>
          <div>
            <dt>Backend</dt>
            <dd>{settings.backend.enabled ? "Enabled" : "Local only"}</dd>
          </div>
          <div>
            <dt>Affiliate links</dt>
            <dd>{settings.affiliateOptOut ? "Opted out" : "Allowed when configured"}</dd>
          </div>
          <div>
            <dt>Preferred links</dt>
            <dd>{preferredProviderSummary(settings.preferredProviderIds)}</dd>
          </div>
        </dl>
      </section>

      <section className="actions">
        <button type="button" onClick={() => chrome.tabs.create({ url: "https://matrix.itasoftware.com/" })}>
          Open ITA Matrix
        </button>
        <button
          type="button"
          className="secondary"
          onClick={() => chrome.runtime.sendMessage({ command: "openOptionsPage" })}
        >
          Options
        </button>
      </section>
    </main>
  );
}

function preferredProviderSummary(providerIds: string[]): string {
  const labels = providerIds.map((providerId) => PROVIDER_LABELS.get(providerId) || providerId);
  if (labels.length === 0) return "Default ranking";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.slice(0, 2).join(", ")} + ${labels.length - 2} more`;
}

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
