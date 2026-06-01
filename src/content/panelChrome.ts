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
      <button type="button" class="icon-button" data-action="${escapeHtml(optionsAction)}" aria-label="Open options" title="Options">⚙</button>
      <button type="button" class="icon-button" data-action="${escapeHtml(minimizeAction)}" aria-label="Minimize panel" title="Minimize">-</button>
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
