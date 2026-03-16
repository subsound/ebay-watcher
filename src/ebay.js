import axios from "axios";
import * as cheerio from "cheerio";
import fs from "node:fs";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function buildStoreUrl(rawUrl, config, pageNumber = 1) {
  const url = new URL(rawUrl);

  url.searchParams.set("_stpos", config.ebayUsZip);
  url.searchParams.set("LH_PrefLoc", "1");
  url.searchParams.set("_sop", config.ebaySortOrder);
  url.searchParams.set("_pgn", String(pageNumber));

  return url.toString();
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrice(value) {
  const text = normalizeText(value);
  return text || null;
}

function normalizeUrl(url) {
  if (!url) {
    return null;
  }

  return url.startsWith("http") ? url : `https://www.ebay.com${url}`;
}

function itemIdFromUrl(url) {
  const match = String(url || "").match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})/i);
  return match ? match[1] : null;
}

function isChallengePage(html, title) {
  const haystack = `${title || ""}\n${html || ""}`.toLowerCase();
  return (
    haystack.includes("verifying your browser") ||
    haystack.includes("desculpe interromper") ||
    haystack.includes("challengeget") ||
    haystack.includes("verificando o seu navegador")
  );
}

function deduplicateListings(listings) {
  const map = new Map();

  for (const listing of listings) {
    const itemId = listing.itemId || itemIdFromUrl(listing.url);
    const url = normalizeUrl(listing.url);

    if (!itemId || !url) {
      continue;
    }

    const current = map.get(itemId);
    const next = {
      itemId,
      title: normalizeText(listing.title) || `Item ${itemId}`,
      url,
      price: normalizePrice(listing.price)
    };

    if (!current) {
      map.set(itemId, next);
      continue;
    }

    if (current.title.startsWith("Item ") && next.title) {
      current.title = next.title;
    }

    if (!current.price && next.price) {
      current.price = next.price;
    }
  }

  return [...map.values()];
}

function loadCookieHeader(config) {
  if (config.ebayCookieHeader) {
    return config.ebayCookieHeader;
  }

  if (!fs.existsSync(config.cookieStorePath)) {
    throw new Error(`Missing cookie store: ${config.cookieStorePath}. Run npm run cookies:refresh.`);
  }

  const rawCookies = JSON.parse(fs.readFileSync(config.cookieStorePath, "utf8"));
  const cookies = Array.isArray(rawCookies) ? rawCookies : [];
  const ebayCookies = cookies.filter((cookie) => String(cookie.domain || "").includes("ebay.com"));

  if (ebayCookies.length === 0) {
    throw new Error(`No eBay cookies found in ${config.cookieStorePath}. Run npm run cookies:refresh.`);
  }

  return ebayCookies
    .map((cookie) => `${cookie.name}=${cookie.value}`)
    .join("; ");
}

function extractListingsFromHtml(html) {
  const $ = cheerio.load(html);
  const listings = [];

  $(".srp-results > li.s-item, .srp-river-results > li.s-item, li.s-item").each((_, element) => {
    const card = $(element);
    const link =
      card.find("a.s-item__link").attr("href") ||
      card.find('a[href*="/itm/"]').first().attr("href");
    const itemId = itemIdFromUrl(link);

    if (!itemId || !link) {
      return;
    }

    const title =
      card.find(".s-item__title").first().text().trim() ||
      card.find("div > div.s-item__info.clearfix > a > div").first().text().trim() ||
      card.find("img").first().attr("alt") ||
      card.find("a.s-item__link").first().attr("aria-label") ||
      `Item ${itemId}`;
    const price = card.find(".s-item__price").first().text().trim() || null;

    listings.push({
      itemId,
      title,
      url: link,
      price
    });
  });

  if (listings.length > 0) {
    return deduplicateListings(listings);
  }

  $('a[href*="/itm/"]').each((_, element) => {
    const anchor = $(element);
    const link = anchor.attr("href");
    const itemId = itemIdFromUrl(link);

    if (!itemId || !link) {
      return;
    }

    const container = anchor.closest("li, div, article");
    const title =
      anchor.attr("aria-label") ||
      container.find(".s-item__title").first().text().trim() ||
      container.find("img").first().attr("alt") ||
      anchor.text().trim() ||
      `Item ${itemId}`;
    const price =
      container.find(".s-item__price").first().text().trim() ||
      container.text().match(/\$\s?\d[\d,.]*/)?.[0] ||
      null;

    listings.push({
      itemId,
      title,
      url: link,
      price
    });
  });

  return deduplicateListings(listings);
}

export async function createEbayClient(config) {
  const cookieHeader = loadCookieHeader(config);
  const client = axios.create({
    timeout: 30000,
    maxRedirects: 5,
    headers: {
      "accept-language": `${config.ebayLocale},en;q=0.9`,
      cookie: cookieHeader,
      pragma: "no-cache",
      referer: "https://www.ebay.com/",
      "upgrade-insecure-requests": "1",
      "user-agent": USER_AGENT
    }
  });

  return {
    async fetchStoreListings(store, knownItems = {}) {
      const allListings = [];
      const seenItemIds = new Set();
      const seenPageFingerprints = new Set();
      let pageNumber = 1;
      let shouldContinue = true;

      while (shouldContinue) {
        const response = await client.get(buildStoreUrl(store.url, config, pageNumber));
        const html = String(response.data || "");
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? normalizeText(titleMatch[1]) : "";

        if (isChallengePage(html, title)) {
          throw new Error(`eBay anti-bot challenge page shown for ${store.name} in HTTP mode`);
        }

        const listings = extractListingsFromHtml(html);
        if (listings.length === 0) {
          if (pageNumber === 1) {
            throw new Error(`No listings parsed for ${store.name} in HTTP mode`);
          }
          break;
        }

        const fingerprint = listings.slice(0, 5).map((item) => item.itemId).join("|");
        if (seenPageFingerprints.has(fingerprint)) {
          break;
        }
        seenPageFingerprints.add(fingerprint);

        for (const listing of listings) {
          if (seenItemIds.has(listing.itemId)) {
            continue;
          }

          seenItemIds.add(listing.itemId);
          allListings.push(listing);
        }

        const newItemsOnPage = listings.filter((item) => !knownItems[item.itemId]);

        if (pageNumber === 1) {
          shouldContinue = newItemsOnPage.length >= config.ebayPageSize;
        } else {
          shouldContinue = newItemsOnPage.length > 0;
        }

        pageNumber += 1;
      }

      return allListings;
    },
    async close() {}
  };
}
