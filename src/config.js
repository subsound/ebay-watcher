import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = process.cwd();
const CONFIG_PATH = path.join(ROOT_DIR, "config", "stores.json");
const STATE_PATH = path.join(ROOT_DIR, "data", "state.json");

function parseBoolean(value, fallback = false) {
  if (value === undefined) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(`Missing config file: ${CONFIG_PATH}`);
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  const stores = Array.isArray(raw.stores) ? raw.stores.filter((store) => store.enabled !== false) : [];

  if (!process.env.BOT_TOKEN) {
    throw new Error("BOT_TOKEN is required in .env");
  }

  if (!process.env.CHAT_ID) {
    throw new Error("CHAT_ID is required in .env");
  }

  if (stores.length === 0) {
    throw new Error("At least one enabled store is required in config/stores.json");
  }

  return {
    rootDir: ROOT_DIR,
    statePath: STATE_PATH,
    botToken: process.env.BOT_TOKEN,
    chatId: process.env.CHAT_ID,
    scanIntervalSeconds: parseNumber(process.env.SCAN_INTERVAL_SECONDS, 30),
    firstRunNotify: parseBoolean(process.env.FIRST_RUN_NOTIFY, false),
    runEnv: process.env.RUN_ENV || "local",
    chromeUserDataDir: process.env.CHROME_USER_DATA_DIR || path.join(ROOT_DIR, ".chrome-user-data"),
    chromeProfileDirectory: process.env.CHROME_PROFILE_DIRECTORY || "Profile 1",
    chromeHeadless: parseBoolean(process.env.CHROME_HEADLESS, false),
    cookieStorePath: path.join(ROOT_DIR, "data", "ebay-cookies.json"),
    ebayCookieHeader: process.env.EBAY_COOKIE_HEADER || "",
    ebayUsZip: process.env.EBAY_US_ZIP || "19808",
    ebayLocale: process.env.EBAY_LOCALE || "en-US",
    ebayTimezone: process.env.EBAY_TIMEZONE || "America/New_York",
    ebaySortOrder: process.env.EBAY_SORT_ORDER || "10",
    ebayPageSize: parseNumber(process.env.EBAY_PAGE_SIZE, 60),
    stores
  };
}
