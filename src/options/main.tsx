import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  countryCodeFromSearchValue,
  countrySearchValue,
  uniqueAirportCountries,
  uniqueAirportRegions,
  uniqueAirportValues,
} from "../shared/airports";
import { LOCAL_PROVIDERS, providerConfidence } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../shared/storage";
import type { ExtensionSettings } from "../shared/types";
import { type MileageProgramOption, uniqueMileageProgramOptions } from "../shared/wheretocredit";
import "./options.css";

function Options(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [programSearch, setProgramSearch] = useState("");
  const [saved, setSaved] = useState(false);
  const countries = useMemo(() => uniqueAirportCountries(), []);
  const continents = useMemo(() => uniqueAirportValues("continent"), []);
  const regions = useMemo(() => uniqueAirportRegions(), []);
  const mileagePrograms = useMemo(() => uniqueMileageProgramOptions(), []);
  const visibleMileagePrograms = useMemo(
    () => filteredMileagePrograms(mileagePrograms, settings.preferredFrequentFlyerPrograms, programSearch),
    [mileagePrograms, settings.preferredFrequentFlyerPrograms, programSearch],
  );

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

  function togglePreferredProgram(program: string): void {
    const values = new Set(settings.preferredFrequentFlyerPrograms);
    values.has(program) ? values.delete(program) : values.add(program);
    void persist({
      ...settings,
      preferredFrequentFlyerPrograms: Array.from(values),
    });
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
        <h2>Frequent Flyer Programs</h2>
        <p className="note">Preferred programs are highlighted first when local mileage data has a matching row.</p>
        <label>
          Search
          <input
            type="search"
            value={programSearch}
            placeholder="Search programs"
            onChange={(event) => setProgramSearch(event.currentTarget.value)}
          />
        </label>
        <fieldset className="program-list">
          <legend>Preferred frequent flyer programs</legend>
          {visibleMileagePrograms.map((program) => (
            <label className="program-row" key={program.program}>
              <input
                type="checkbox"
                checked={settings.preferredFrequentFlyerPrograms.includes(program.program)}
                onChange={() => togglePreferredProgram(program.program)}
              />
              {program.carrierCodes[0] ? (
                <img
                  src={chrome.runtime.getURL(`assets/carriers64/light/${program.carrierCodes[0]}.png`)}
                  alt=""
                  aria-hidden="true"
                />
              ) : null}
              <span>{program.label}</span>
            </label>
          ))}
        </fieldset>
        {visibleMileagePrograms.length === 0 ? (
          <p className="note">No matching programs.</p>
        ) : settings.preferredFrequentFlyerPrograms.length > 0 ? (
          <div className="selected-summary">
            {settings.preferredFrequentFlyerPrograms.length} selected
            <button type="button" onClick={() => void persist({ ...settings, preferredFrequentFlyerPrograms: [] })}>
              Clear
            </button>
          </div>
        ) : null}
      </section>

      <section>
        <h2>Airport Helper Defaults</h2>
        <div className="grid">
          <Select
            label="Region"
            value={settings.airportHelper.region}
            values={["", ...regions.map((region) => region.id)]}
            labels={new Map(regions.map((region) => [region.id, region.label]))}
            onChange={(region) => void persist({ ...settings, airportHelper: { ...settings.airportHelper, region } })}
          />
          <Select
            label="Continent"
            value={settings.airportHelper.continent}
            values={["", ...continents]}
            onChange={(continent) =>
              void persist({ ...settings, airportHelper: { ...settings.airportHelper, continent } })
            }
          />
          <label>
            Country
            <input
              key={settings.airportHelper.countries[0] || "any-country"}
              type="search"
              list="country-options"
              defaultValue={countrySearchValue(settings.airportHelper.countries[0] || "")}
              placeholder="Search country"
              onBlur={(event) => {
                const country = countryCodeFromSearchValue(event.currentTarget.value);
                void persist({
                  ...settings,
                  airportHelper: { ...settings.airportHelper, countries: country ? [country] : [] },
                });
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.currentTarget.blur();
              }}
            />
            <datalist id="country-options">
              {countries.map((country) => (
                <option key={country.code} value={country.searchValue} />
              ))}
            </datalist>
          </label>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void persist({
                ...settings,
                airportHelper: { ...settings.airportHelper, countries: [] },
              })
            }
          >
            Clear country
          </button>
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
  labels?: Map<string, string>;
  onChange: (value: string) => void;
}): React.ReactElement {
  return (
    <label>
      {props.label}
      <select value={props.value} onChange={(event) => props.onChange(event.currentTarget.value)}>
        {props.values.map((value) => (
          <option key={value || "any"} value={value}>
            {props.labels?.get(value) || value || "Any"}
          </option>
        ))}
      </select>
    </label>
  );
}

function providerReliabilityCopy(score: number): { tone: "high" | "medium" | "low"; label: string; help: string } {
  const confidence = providerConfidence(score);
  if (confidence === "high") {
    return {
      tone: "high",
      label: "Reliable",
      help: "Usually opens the right route and date.",
    };
  }
  if (confidence === "medium") {
    return {
      tone: "medium",
      label: "Check details",
      help: "May need manual adjustment.",
    };
  }
  return {
    tone: "low",
    label: "Unreliable",
    help: "Use as a fallback.",
  };
}

function categoryLabel(category: string): string {
  if (category === "miles") return "miles credit";
  if (category === "meta") return "flight search";
  if (category === "ota") return "booking site";
  if (category === "airline") return "airline";
  return category;
}

function filteredMileagePrograms(
  programs: MileageProgramOption[],
  selectedPrograms: string[],
  search: string,
): MileageProgramOption[] {
  const selectedRanks = new Map(selectedPrograms.map((program, index) => [program, index]));
  const query = search.trim().toLowerCase();
  return programs
    .filter(
      (program) =>
        !query ||
        program.label.toLowerCase().includes(query) ||
        program.carrierCodes.some((carrierCode) => carrierCode.toLowerCase().includes(query)),
    )
    .sort((left, right) => {
      const leftSelected = selectedRanks.has(left.program);
      const rightSelected = selectedRanks.has(right.program);
      if (leftSelected !== rightSelected) return leftSelected ? -1 : 1;
      if (leftSelected && rightSelected) {
        return (selectedRanks.get(left.program) ?? 0) - (selectedRanks.get(right.program) ?? 0);
      }
      return left.label.localeCompare(right.label);
    })
    .slice(0, query ? 30 : 14);
}

createRoot(document.getElementById("root") as HTMLElement).render(<Options />);
