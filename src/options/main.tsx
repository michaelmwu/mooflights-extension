import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  airportAreaFromSearchValue,
  airportAreaOptions,
  airportAreaSearchValue,
  countrySearchValue,
} from "../shared/airports";
import { flagEmoji } from "../shared/flags";
import { DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES, parseGoogleFlightsCountryInput } from "../shared/googleFlightsBooking";
import {
  allGoogleFlightsCountryCodes,
  filterAvailableGoogleFlightsCountryCodes,
  googleFlightsAvailableCountryOptions,
  googleFlightsCountryCodeFromSearchValue,
  isAllGoogleFlightsCountryCodes,
} from "../shared/googleFlightsCountries";
import {
  type MileageProgramOption,
  mileageProgramTierOptions,
  uniqueMileageProgramOptions,
} from "../shared/mileageEarnings";
import { ALWAYS_SHOWN_PROVIDER_IDS, LOCAL_PROVIDERS, providerConfidence } from "../shared/providers";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../shared/storage";
import type { AirportFilters, ExtensionSettings } from "../shared/types";
import "./options.css";

function Options(): React.ReactElement {
  const [settings, setSettings] = useState<ExtensionSettings>(DEFAULT_SETTINGS);
  const [programSearch, setProgramSearch] = useState("");
  const [googleFlightsCountrySearch, setGoogleFlightsCountrySearch] = useState("");
  const [saved, setSaved] = useState(false);
  const airportAreas = useMemo(() => airportAreaOptions(), []);
  const googleFlightsCountries = useMemo(() => googleFlightsAvailableCountryOptions(), []);
  const allGoogleFlightsCountries = useMemo(() => allGoogleFlightsCountryCodes(), []);
  const usesAllGoogleFlightsCountries = isAllGoogleFlightsCountryCodes(settings.googleFlights.countryCodes);
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

  function setProviderPreference(providerId: string, preference: "preferred" | "hidden", enabled: boolean): void {
    const preferredProviderIds = new Set(settings.preferredProviderIds);
    const hiddenProviderIds = new Set(settings.hiddenProviderIds);
    if (preference === "preferred") {
      enabled ? preferredProviderIds.add(providerId) : preferredProviderIds.delete(providerId);
      if (enabled) hiddenProviderIds.delete(providerId);
    } else {
      enabled ? hiddenProviderIds.add(providerId) : hiddenProviderIds.delete(providerId);
      if (enabled) preferredProviderIds.delete(providerId);
    }
    void persist({
      ...settings,
      preferredProviderIds: Array.from(preferredProviderIds),
      hiddenProviderIds: Array.from(hiddenProviderIds),
    });
  }

  function togglePreferredProgram(program: string): void {
    const values = new Set(settings.preferredFrequentFlyerPrograms);
    values.has(program) ? values.delete(program) : values.add(program);
    const frequentFlyerProgramTiers = { ...settings.frequentFlyerProgramTiers };
    if (!values.has(program)) delete frequentFlyerProgramTiers[program];
    void persist({
      ...settings,
      preferredFrequentFlyerPrograms: Array.from(values),
      frequentFlyerProgramTiers,
    });
  }

  function setProgramTier(program: string, tier: string): void {
    const frequentFlyerProgramTiers = { ...settings.frequentFlyerProgramTiers };
    if (tier) {
      frequentFlyerProgramTiers[program] = tier;
    } else {
      delete frequentFlyerProgramTiers[program];
    }
    const preferredPrograms = new Set(settings.preferredFrequentFlyerPrograms);
    if (tier) preferredPrograms.add(program);
    void persist({
      ...settings,
      preferredFrequentFlyerPrograms: Array.from(preferredPrograms),
      frequentFlyerProgramTiers,
    });
  }

  function addGoogleFlightsCountry(): void {
    const country =
      googleFlightsCountryCodeFromSearchValue(googleFlightsCountrySearch, googleFlightsCountries) ||
      filterAvailableGoogleFlightsCountryCodes(parseGoogleFlightsCountryInput(googleFlightsCountrySearch))[0] ||
      "";
    if (!country) return;
    setGoogleFlightsCountrySearch("");
    void persist({
      ...settings,
      googleFlights: {
        ...settings.googleFlights,
        countryCodes: filterAvailableGoogleFlightsCountryCodes([...settings.googleFlights.countryCodes, country]),
      },
    });
  }

  function removeGoogleFlightsCountry(country: string): void {
    const countryCodes = filterAvailableGoogleFlightsCountryCodes(
      settings.googleFlights.countryCodes.filter((code) => code !== country),
    );
    void persist({
      ...settings,
      googleFlights: {
        ...settings.googleFlights,
        countryCodes,
      },
    });
  }

  const alwaysShownProviders = new Set<string>(ALWAYS_SHOWN_PROVIDER_IDS);
  const configurableProviders = LOCAL_PROVIDERS.filter((provider) => !alwaysShownProviders.has(provider.id));
  const preferredProviders = configurableProviders.filter((provider) =>
    settings.preferredProviderIds.includes(provider.id),
  );
  const hiddenProviders = configurableProviders.filter((provider) => settings.hiddenProviderIds.includes(provider.id));

  return (
    <main>
      <header>
        <div className="title">
          <img src={chrome.runtime.getURL("assets/extension-icons/icon-48.png")} alt="" width="48" height="48" />
          <div>
            <h1>Mu Travel Flights</h1>
            <p>Companion tools for Google Flights and ITA Matrix.</p>
          </div>
        </div>
        <span>{saved ? "Saved" : " "}</span>
      </header>

      <section>
        <h2>Google Flights</h2>
        <p className="note">Default countries for booking-page price comparisons.</p>
        <div className="country-picker">
          <label>
            Add country
            <input
              type="search"
              list="google-country-options"
              value={googleFlightsCountrySearch}
              placeholder="Search country or enter code"
              onChange={(event) => setGoogleFlightsCountrySearch(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addGoogleFlightsCountry();
              }}
            />
            <datalist id="google-country-options">
              {googleFlightsCountries.map((country) => (
                <option key={country.code} value={country.searchValue} />
              ))}
            </datalist>
          </label>
          <button type="button" className="secondary" onClick={addGoogleFlightsCountry}>
            Add
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void persist({
                ...settings,
                googleFlights: {
                  ...settings.googleFlights,
                  countryCodes: [...DEFAULT_GOOGLE_FLIGHTS_COUNTRY_CODES],
                },
              })
            }
          >
            Recommended
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void persist({
                ...settings,
                googleFlights: {
                  ...settings.googleFlights,
                  countryCodes: allGoogleFlightsCountries,
                },
              })
            }
          >
            All useful countries
          </button>
        </div>
        {usesAllGoogleFlightsCountries ? (
          <p className="note country-warning">
            All useful countries excludes unsupported and not-useful markets. Results appear as each country finishes.
          </p>
        ) : null}
        <div className="country-list">
          {settings.googleFlights.countryCodes.map((country) => (
            <span className="country-chip" key={country}>
              <span className="flag" aria-hidden="true">
                {flagEmoji(country)}
              </span>
              {countryDisplayName(country)}
              <button
                type="button"
                aria-label={`Remove ${country}`}
                onClick={() => removeGoogleFlightsCountry(country)}
              >
                x
              </button>
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2>ITA Matrix</h2>

        <div className="settings-group">
          <h3>Frequent Flyer Programs</h3>
          <p className="note">Preferred programs are highlighted first.</p>
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
            <div className="program-list-scroll">
              {visibleMileagePrograms.map((program) => {
                const tierOptions = mileageProgramTierOptions(program.program);
                return (
                  <div className={`program-row ${tierOptions.length > 0 ? "with-tier" : ""}`} key={program.program}>
                    <label className="program-choice">
                      <input
                        type="checkbox"
                        checked={settings.preferredFrequentFlyerPrograms.includes(program.program)}
                        onChange={() => togglePreferredProgram(program.program)}
                      />
                      <span className="program-icon" aria-hidden="true">
                        {program.carrierCodes[0] ? (
                          <img
                            src={chrome.runtime.getURL(`assets/carriers64/light/${program.carrierCodes[0]}.png`)}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.visibility = "hidden";
                            }}
                          />
                        ) : null}
                      </span>
                      <span>{program.label}</span>
                    </label>
                    {tierOptions.length > 0 ? (
                      <select
                        aria-label={`${program.program} status level`}
                        value={settings.frequentFlyerProgramTiers[program.program] || ""}
                        onChange={(event) => setProgramTier(program.program, event.currentTarget.value)}
                      >
                        <option value="">All levels</option>
                        {tierOptions.map((tier) => (
                          <option key={tier.program} value={tier.program}>
                            {tier.label}
                          </option>
                        ))}
                      </select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>
          {visibleMileagePrograms.length === 0 ? (
            <p className="note">No matching programs.</p>
          ) : settings.preferredFrequentFlyerPrograms.length > 0 ? (
            <div className="selected-summary">
              {settings.preferredFrequentFlyerPrograms.length} selected
              <button
                type="button"
                onClick={() =>
                  void persist({ ...settings, preferredFrequentFlyerPrograms: [], frequentFlyerProgramTiers: {} })
                }
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>

        <div className="settings-group">
          <h3>Airport Helper Defaults</h3>
          <div className="grid">
            <label>
              Area
              <input
                key={airportAreaSearchValue(settings.airportHelper) || "any-area"}
                type="search"
                list="airport-area-options"
                defaultValue={airportAreaSearchValue(settings.airportHelper)}
                placeholder="Search region, continent, or country"
                onBlur={(event) => {
                  const nextAirportHelper = airportHelperWithArea(settings.airportHelper, event.currentTarget.value);
                  void persist({
                    ...settings,
                    airportHelper: nextAirportHelper,
                  });
                }}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.currentTarget.blur();
                }}
              />
              <datalist id="airport-area-options">
                {airportAreas.map((area) => (
                  <option key={`${area.type}:${area.value}`} value={area.searchValue} />
                ))}
              </datalist>
            </label>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                void persist({
                  ...settings,
                  airportHelper: {
                    ...settings.airportHelper,
                    region: "",
                    continent: "",
                    countries: [],
                    exclusions: [],
                  },
                })
              }
            >
              Clear area
            </button>
          </div>
        </div>

        <div className="settings-group">
          <h3>Provider Links</h3>
          <p className="note">
            Where to Credit and Google Flights are always shown. Choose which additional booking and search links appear
            after ITA Matrix captures an itinerary.
          </p>
          <div className="provider-summary">
            <div>
              <strong>Preferred</strong>
              <div className="provider-chips">
                {preferredProviders.map((provider) => (
                  <button
                    type="button"
                    key={provider.id}
                    className="provider-chip"
                    onClick={() => setProviderPreference(provider.id, "preferred", false)}
                  >
                    {provider.label} x
                  </button>
                ))}
              </div>
            </div>
            <div>
              <strong>Hidden</strong>
              <div className="provider-chips">
                {hiddenProviders.length > 0
                  ? hiddenProviders.map((provider) => (
                      <button
                        type="button"
                        key={provider.id}
                        className="provider-chip muted"
                        onClick={() => setProviderPreference(provider.id, "hidden", false)}
                      >
                        {provider.label} x
                      </button>
                    ))
                  : "None"}
              </div>
            </div>
          </div>
          <details className="provider-menu">
            <summary>Manage providers</summary>
            <div className="provider-menu-list">
              {configurableProviders.map((provider) => {
                const reliability = providerReliabilityCopy(provider.reliabilityScore);
                return (
                  <div className={`provider-option ${reliability.tone}`} key={provider.id}>
                    <div>
                      <strong>{provider.label}</strong>
                      <small>
                        <span className="status-dot" aria-hidden="true" />
                        {reliability.label} · {categoryLabel(provider.category)}
                      </small>
                    </div>
                    <label className="check compact">
                      <input
                        type="checkbox"
                        checked={settings.preferredProviderIds.includes(provider.id)}
                        onChange={(event) =>
                          setProviderPreference(provider.id, "preferred", event.currentTarget.checked)
                        }
                      />
                      Prefer
                    </label>
                    <label className="check compact">
                      <input
                        type="checkbox"
                        checked={settings.hiddenProviderIds.includes(provider.id)}
                        onChange={(event) => setProviderPreference(provider.id, "hidden", event.currentTarget.checked)}
                      />
                      Hide
                    </label>
                  </div>
                );
              })}
            </div>
          </details>
        </div>
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

  async function persistBackend(enabled: boolean, baseUrl = props.settings.backend.baseUrl): Promise<void> {
    const allowed = !enabled || (await requestBackendHostPermission(baseUrl));
    await props.persist({
      ...props.settings,
      backend: { enabled: allowed && enabled, baseUrl },
    });
  }

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
          onChange={(event) => void persistBackend(event.currentTarget.checked)}
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
          onBlur={(event) => void persistBackend(props.settings.backend.enabled, event.currentTarget.value)}
        />
      </label>
      <div className="target-row">
        {localTargets.map((target) => (
          <button type="button" key={target} onClick={() => void persistBackend(true, target)}>
            {target}
          </button>
        ))}
      </div>
    </section>
  );
}

async function requestBackendHostPermission(baseUrl: string): Promise<boolean> {
  if (!chrome.permissions?.request) return false;
  const origin = hostPermissionOrigin(baseUrl);
  if (!origin) return false;
  return chrome.permissions.request({ origins: [origin] });
}

function hostPermissionOrigin(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return `${url.origin}/*`;
  } catch {
    return "";
  }
}

function providerReliabilityCopy(score: number): { tone: "high" | "medium" | "low"; label: string; help?: string } {
  const confidence = providerConfidence(score);
  if (confidence === "high") {
    return {
      tone: "high",
      label: "Reliable",
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

function airportHelperWithArea(airportHelper: AirportFilters, value: string): AirportFilters {
  if (!value.trim()) {
    return {
      ...airportHelper,
      region: "",
      continent: "",
      countries: [],
      exclusions: [],
    };
  }

  const area = airportAreaFromSearchValue(value);
  if (!hasAirportArea(area)) return airportHelper;

  const currentAreaValue = airportAreaSearchValue(airportHelper);
  const nextAreaValue = airportAreaSearchValue({ ...airportHelper, ...area });
  const areaChanged = currentAreaValue !== nextAreaValue;

  return {
    ...airportHelper,
    ...area,
    exclusions: areaChanged ? [] : airportHelper.exclusions,
  };
}

function hasAirportArea(area: Pick<AirportFilters, "region" | "continent" | "countries">): boolean {
  return Boolean(area.region || area.continent || area.countries.length > 0);
}

function countryDisplayName(code: string): string {
  const searchValue = countrySearchValue(code);
  return searchValue.replace(/\s+\([A-Z]{2}\)$/, "") || code;
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
    });
}

createRoot(document.getElementById("root") as HTMLElement).render(<Options />);
