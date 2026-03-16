import { loadConfig } from "./config.js";
import { createEbayClient } from "./ebay.js";
import { log, logError } from "./logger.js";
import { StateStore } from "./state-store.js";
import { buildTelegramMessage, sendTelegramMessage } from "./telegram.js";

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function computeNewItems(knownItems, listings) {
  return listings.filter((item) => !knownItems[item.itemId]);
}

function buildKnownItems(listings, previousKnownItems) {
  const next = { ...previousKnownItems };

  for (const item of listings) {
    next[item.itemId] = {
      title: item.title,
      url: item.url,
      price: item.price,
      firstSeenAt: previousKnownItems[item.itemId]?.firstSeenAt || new Date().toISOString(),
      lastSeenAt: new Date().toISOString()
    };
  }

  return next;
}

async function scanStore(store, config, stateStore, ebayClient) {
  const currentState = stateStore.getStoreState(store.name);
  const listings = await ebayClient.fetchStoreListings(store, currentState.knownItems);
  const newItems = computeNewItems(currentState.knownItems, listings);
  const shouldNotify = currentState.initialized ? newItems.length > 0 : config.firstRunNotify && newItems.length > 0;

  stateStore.updateStoreState(store.name, (prev) => ({
    initialized: true,
    lastScanAt: new Date().toISOString(),
    knownItems: buildKnownItems(listings, prev.knownItems)
  }));

  log(`${store.name}: scanned ${listings.length} items, ${newItems.length} new`);

  if (shouldNotify) {
    const message = buildTelegramMessage(store.name, newItems);
    await sendTelegramMessage(config.botToken, config.chatId, message);
    log(`${store.name}: Telegram notification sent for ${newItems.length} items`);
  } else if (!currentState.initialized && !config.firstRunNotify) {
    log(`${store.name}: baseline initialized without Telegram notification`);
  }
}

async function runCycle(config, stateStore, ebayClient) {
  for (const store of config.stores) {
    try {
      await scanStore(store, config, stateStore, ebayClient);
    } catch (error) {
      logError(`Scan failed for ${store.name}`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

async function runTelegramTest(config) {
  const text = buildTelegramMessage("test-store", [
    {
      title: "Test listing from eBay Watcher",
      price: "$0.00",
      url: "https://www.ebay.com/itm/123456789012"
    }
  ]);

  await sendTelegramMessage(config.botToken, config.chatId, text);
  log("Telegram test message sent");
}

async function main() {
  const config = loadConfig();
  const stateStore = new StateStore(config.statePath);
  const ebayClient = await createEbayClient(config);
  const onceMode = hasFlag("--once");
  const telegramTestMode = hasFlag("--telegram-test");

  try {
    if (telegramTestMode) {
      await runTelegramTest(config);
      await ebayClient.close();
      return;
    }

    log(`Watcher started in ${config.runEnv} mode for ${config.stores.length} stores`);
    await runCycle(config, stateStore, ebayClient);

    if (onceMode) {
      log("Single scan completed");
      await ebayClient.close();
      return;
    }

    const shutdown = async (signal) => {
      log(`Received ${signal}, shutting down`);
      await ebayClient.close();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      shutdown("SIGINT").catch((error) => {
        logError("Shutdown failed", error);
        process.exit(1);
      });
    });

    process.on("SIGTERM", () => {
      shutdown("SIGTERM").catch((error) => {
        logError("Shutdown failed", error);
        process.exit(1);
      });
    });

    setInterval(() => {
      runCycle(config, stateStore, ebayClient).catch((error) => {
        logError("Unexpected cycle error", error);
      });
    }, config.scanIntervalSeconds * 1000);
  } catch (error) {
    await ebayClient.close();
    throw error;
  }
}

main().catch((error) => {
  logError("Application failed to start", error);
  process.exitCode = 1;
});
