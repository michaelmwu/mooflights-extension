import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { uniqueAirlines, uniqueAirportValues, uniqueAlliances } from "../shared/airports";
import { LOCAL_PROVIDERS } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import "./options.css";

function Options(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const countries = useMemo(() => uniqueAirportValues("country"), []);
  const continents = useMemo(() => uniqueAirportValues("continent"), []);
  const alliances = useMemo(() => uniqueAlliances(), []);
  const airlines = useMemo(() => uniqueAirlines(), []);

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  async function persist(next: ExtensionSettings): Promise<void> {
    setSettings(next);
    await saveSettings(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function toggleList(key: "hiddenProviderIds" | "preferredProviderIds", providerId: string): void {
    const values = new Set(settings[key]);
    values.has(providerId) ? values.delete(providerId) : values.add(providerId);
    void persist({ ...settings, [key]: Array.from(values) });
  }

  return (
    <main>
      <header>
        <div>
          <h1>Mu Travel Flights</h1>
          <p>Preferences for provider links, ITA Matrix helpers, and optional Mu Travel services.</p>
        </div>
        <span>{saved ? "Saved" : " "}</span>
      </header>

      <section>
        <h2>Provider Preferences</h2>
        <p className="note">Statuses describe how likely each link is to open the right route and date.</p>
        <div className="providers">
          {LOCAL_PROVIDERS.map((provider) => {
            const reliability = providerReliabilityCopy(provider.reliabilityScore);
            return (
              <div className={`provider ${reliability.tone}`} key={provider.id}>
                <div>
                  <strong>{provider.label}</strong>
                  <small>
                    <span className="status-dot" aria-hidden="true" />
                    {reliability.label} · {categoryLabel(provider.category)}
                  </small>
                  <small>{provider.knownIssues || reliability.help}</small>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.preferredProviderIds.includes(provider.id)}
                    onChange={() => toggleList("preferredProviderIds", provider.id)}
                  />
                  Prefer
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.hiddenProviderIds.includes(provider.id)}
                    onChange={() => toggleList("hiddenProviderIds", provider.id)}
                  />
                  Hide
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Airport Helper Defaults</h2>
        <div className="grid">
          <Select
            label="Continent"
            value={settings.airportHelper.continent}
            values={["", ...continents]}
            onChange={(continent) =>
              void persist({ ...settings, airportHelper: { ...settings.airportHelper, continent } })
            }
          />
          <Select
            label="Alliance"
            value={settings.airportHelper.alliance}
            values={["", ...alliances]}
            onChange={(alliance) =>
              void persist({ ...settings, airportHelper: { ...settings.airportHelper, alliance } })
            }
          />
          <Select
            label="Country"
            value={settings.airportHelper.countries[0] || ""}
            values={["", ...countries]}
            onChange={(country) =>
              void persist({
                ...settings,
                airportHelper: { ...settings.airportHelper, countries: country ? [country] : [] },
              })
            }
          />
          <Select
            label="Airline"
            value={settings.airportHelper.airlines[0] || ""}
            values={["", ...airlines]}
            onChange={(airline) =>
              void persist({
                ...settings,
                airportHelper: { ...settings.airportHelper, airlines: airline ? [airline] : [] },
              })
            }
          />
        </div>
      </section>

      <section>
        <h2>Open/Closed Boundary</h2>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.affiliateOptOut}
            onChange={(event) => void persist({ ...settings, affiliateOptOut: event.currentTarget.checked })}
          />
          Opt out of affiliate routing when configured.
        </label>
        <p className="note">
          The public extension works locally. Hosted Mu Travel services are optional and configured only in dev builds
          for now.
        </p>
      </section>

      {__MU_TRAVEL_DEV_BUILD__ ? (
        <DeveloperBackend settings={settings} setSettings={setSettings} persist={persist} />
      ) : null}
    </main>
  );
}

function DeveloperBackend(props: {
  settings: ExtensionSettings;
  setSettings: (settings: ExtensionSettings) => void;
  persist: (settings: ExtensionSettings) => Promise<void>;
}): React.ReactElement {
  const localTargets = [
    "http://localhost:48731",
    "http://127.0.0.1:48731",
    "http://localhost:3000",
    "http://localhost:8787",
  ];

  return (
    <section className="dev-panel">
      <h2>Developer Backend</h2>
      <p className="note">
        Dev-build-only controls for pointing the extension at a locally running Mu Travel API. This is an HTTPS/API
        boundary, not direct database access.
      </p>
      <label className="check">
        <input
          type="checkbox"
          checked={props.settings.backend.enabled}
          onChange={(event) =>
            void props.persist({
              ...props.settings,
              backend: { ...props.settings.backend, enabled: event.currentTarget.checked },
            })
          }
        />
        Fetch optional provider metadata from backend.
      </label>
      <label>
        API base URL
        <input
          value={props.settings.backend.baseUrl}
          onChange={(event) =>
            props.setSettings({
              ...props.settings,
              backend: { ...props.settings.backend, baseUrl: event.currentTarget.value },
            })
          }
          onBlur={(event) =>
            void props.persist({
              ...props.settings,
              backend: { ...props.settings.backend, baseUrl: event.currentTarget.value },
            })
          }
        />
      </label>
      <div className="target-row">
        {localTargets.map((target) => (
          <button
            type="button"
            key={target}
            onClick={() =>
              void props.persist({
                ...props.settings,
                backend: { enabled: true, baseUrl: target },
              })
            }
          >
            {target}
          </button>
        ))}
      </div>
    </section>
  );
}

function Select(props: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
        {props.values.map((value) => (
          <option key={value || "any"} value={value}>
            {value || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
}

function providerReliabilityCopy(score: number): { tone: "high" | "medium" | "low"; label: string; help: string } {
  if (score >= 85) {
    return {
      tone: "high",
      label: "Reliable",
      help: "Usually opens the matching route and date. Verify fare and flight details before booking.",
    };
  }
  if (score >= 70) {
    return {
      tone: "medium",
      label: "Check details",
      help: "Often opens the right search, but may need manual adjustment.",
    };
  }
  return {
    tone: "low",
    label: "Unreliable",
    help: "May fail or require manual search. Use only as a fallback.",
  };
}

function categoryLabel(category: string): string {
  if (category === "miles") return "miles credit";
  if (category === "meta") return "flight search";
  if (category === "ota") return "booking site";
  if (category === "airline") return "airline";
  return category;
}

createRoot(document.getElementById("root") as HTMLElement).render(<Options />);
