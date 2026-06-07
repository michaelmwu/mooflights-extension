const PANEL_ICON_32_PATH = "assets/extension-icons/icon-32.png";
const PANEL_ICON_64_PATH = "assets/extension-icons/icon-64.png";

type PanelHeaderOptions = {
  optionsAction: string;
  minimizeAction?: string;
};

export function muTravelPanelIconUrl(): string {
  return chrome.runtime.getURL(PANEL_ICON_32_PATH);
}

export function muTravelMinimizedIconUrl(): string {
  return chrome.runtime.getURL(PANEL_ICON_64_PATH);
}

export function renderMuTravelPanelHeader({
  optionsAction,
  minimizeAction = "minimize-panel",
}: PanelHeaderOptions): string {
  return `<header data-role="panel-header">
    <div class="brand">
      <img src="${escapeHtml(muTravelPanelIconUrl())}" alt="" width="32" height="32">
      <strong>Mu Travel Flights</strong>
    </div>
    <div class="header-actions">
      <details class="panel-menu">
        <summary class="icon-button" aria-label="Panel actions" title="Panel actions">⋮</summary>
        <div class="panel-menu-popover" aria-label="Panel actions">
          <button type="button" class="menu-item" data-action="hide-panel-session">
            <span class="menu-icon" aria-hidden="true">✕</span>
            <span>Hide for this session</span>
          </button>
          <button type="button" class="menu-item" data-action="${escapeHtml(minimizeAction)}">
            <span class="menu-icon" aria-hidden="true">−</span>
            <span>Minimize</span>
          </button>
          <button type="button" class="menu-item" data-action="${escapeHtml(optionsAction)}">
            <span class="menu-icon" aria-hidden="true">⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </details>
    </div>
  </header>`;
}

export function renderMuTravelMinimizedButton(): string {
  return `<button type="button" class="panel-icon" data-action="restore-panel" aria-label="Expand Mu Travel panel">
    <img src="${escapeHtml(muTravelMinimizedIconUrl())}" alt="" width="64" height="64">
  </button>`;
}

export function muTravelPanelHeaderStyles(): string {
  return `
    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-bottom: 1px solid #e2e8f0;
      cursor: grab;
      user-select: none;
    }
    header:active { cursor: grabbing; }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .brand img {
      width: 32px;
      height: 32px;
      border-radius: 6px;
      flex: 0 0 auto;
    }
    .brand strong {
      min-width: 0;
      font-size: 18px;
      line-height: 1.2;
      font-weight: 800;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex: 0 0 auto;
    }
    .panel-menu {
      position: relative;
      display: inline-grid;
      flex: 0 0 auto;
      margin: 0;
      padding: 0;
      border: 0;
    }
    .panel-menu summary {
      box-sizing: border-box;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      list-style: none;
      font: inherit;
      cursor: pointer;
    }
    .panel-menu summary::-webkit-details-marker {
      display: none;
    }
    .panel-menu-popover {
      position: absolute;
      top: calc(100% + 6px);
      right: 0;
      z-index: 2;
      display: grid;
      min-width: 184px;
      padding: 4px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.18);
    }
    .menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 7px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: #172033;
      cursor: pointer;
      text-align: left;
      white-space: nowrap;
    }
    .menu-item:hover,
    .menu-item:focus-visible {
      background: #f1f5f9;
      color: #0f172a;
      outline: none;
    }
    .menu-icon {
      display: inline-grid;
      place-items: center;
      width: 16px;
      color: #64748b;
      font-size: 14px;
      line-height: 1;
    }
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });
}
