export type ToolbarPanelStatus = "active" | "hidden" | "waiting";
export type ToolbarPanelCommand = "getToolbarPanelStatus" | "showToolbarPanel";

export function listenForToolbarPanel(getStatus: () => ToolbarPanelStatus, showPanel: () => void): void {
  chrome.runtime.onMessage.addListener((message: unknown, sender, respond) => {
    if (sender.url !== chrome.runtime.getURL("popup/index.html") || !message || typeof message !== "object") return;
    const command = (message as { command?: unknown }).command;
    if (command !== "getToolbarPanelStatus" && command !== "showToolbarPanel") return;
    const status = getStatus();
    if (command === "showToolbarPanel" && status === "hidden") {
      showPanel();
      respond(getStatus());
      return;
    }
    respond(status);
  });
}
