import type React from "react";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { DEFAULT_SETTINGS, loadSettings } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import "./popup.css";

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
            <dd>{settings.preferredProviderIds.length || "Default ranking"}</dd>
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

createRoot(document.getElementById("root") as HTMLElement).render(<Popup />);
