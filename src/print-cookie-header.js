import fs from "node:fs";
import { loadConfig } from "./config.js";

function main() {
  const config = loadConfig();

  if (!fs.existsSync(config.cookieStorePath)) {
    throw new Error(`Missing cookie store: ${config.cookieStorePath}. Run npm run cookies:refresh first.`);
  }

  const cookies = JSON.parse(fs.readFileSync(config.cookieStorePath, "utf8"));
  const header = cookies
    .filter((cookie) => String(cookie.domain || "").includes("ebay.com"))
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");

  console.log(header);
}

main();
