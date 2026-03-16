import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { loadConfig } from "./config.js";

const CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function removeProfileLocks(userDataDir) {
  for (const name of ["SingletonLock", "SingletonSocket", "SingletonCookie", "lockfile"]) {
    try {
      fs.rmSync(path.join(userDataDir, name), { force: true, recursive: true });
    } catch {
      continue;
    }
  }
}

async function main() {
  const config = loadConfig();
  removeProfileLocks(config.chromeUserDataDir);

  const context = await chromium.launchPersistentContext(config.chromeUserDataDir, {
    executablePath: CHROME_PATH,
    headless: true,
    args: [
      `--profile-directory=${config.chromeProfileDirectory}`,
      `--lang=${config.ebayLocale}`,
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox"
    ],
    locale: config.ebayLocale,
    timezoneId: config.ebayTimezone,
    viewport: { width: 1440, height: 1200 }
  });

  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://www.ebay.com/", { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(5000);

    const cookies = await context.cookies("https://www.ebay.com");
    fs.writeFileSync(config.cookieStorePath, JSON.stringify(cookies, null, 2));
    console.log(`Saved ${cookies.length} cookies to ${config.cookieStorePath}`);
  } finally {
    await context.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
