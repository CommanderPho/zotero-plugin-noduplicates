import { blockDuplicateItem } from "./modules/noDuplicates";
import { initLocale } from "./utils/locale";
import { createZToolkit } from "./utils/ztoolkit";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  // Mark initialized as true to confirm plugin loading status
  // outside of the plugin (e.g. scaffold testing process)
  addon.data.initialized = true;
}

async function onMainWindowLoad(win: _ZoteroTypes.MainWindow): Promise<void> {
  // Create ztoolkit for every window
  addon.data.ztoolkit = createZToolkit();
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

function onShutdown(): void {
  ztoolkit.unregisterAll();
  // Remove addon object
  addon.data.alive = false;
  // @ts-expect-error - Plugin instance is not typed
  delete Zotero[addon.data.config.addonInstance];
}

/**
 * Dispatcher for Zotero Notifier events.
 * Handles item/add events to block duplicate imports.
 */
async function onNotify(
  event: string,
  type: string,
  ids: Array<string | number>,
  extraData: { [key: string]: any },
) {
  ztoolkit.log("notify", event, type, ids, extraData);

  if (event !== "add" || type !== "item") {
    return;
  }

  let blockedCount = 0;
  for (const id of ids) {
    const item = await Zotero.Items.getAsync(id);
    const existingItem = await blockDuplicateItem(item);
    if (existingItem) {
      blockedCount += 1;
    }
  }

  if (blockedCount <= 0) {
    return;
  }

  const blockedSummary =
    blockedCount === 1
      ? "Duplicate item blocked and moved to Trash."
      : `${blockedCount} duplicate items blocked and moved to Trash.`;

  new ztoolkit.ProgressWindow(addon.data.config.addonName)
    .createLine({
      text: blockedSummary,
      type: "default",
      progress: 100,
    })
    .show();
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
};
