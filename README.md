# eBay Watcher

`Node.js` service that monitors multiple eBay seller pages and sends Telegram alerts when new listings appear.

## Features

- Multiple stores configured in `config/stores.json`
- Telegram bot notifications
- State persisted in `data/state.json`
- Conditional pagination when the first page is fully new
- HTTP scanning with `axios + cheerio`
- Optional cookie refresh from a local Chrome profile

## Run

```bash
node --env-file=.env src/index.js
```

## Refresh cookies

```bash
node --env-file=.env src/refresh-cookies.js
node --env-file=.env src/print-cookie-header.js
```

## First test run

1. Send a Telegram test message:

```bash
node --env-file=.env src/index.js --telegram-test
```

2. Run one scan only and build the initial baseline:

```bash
node --env-file=.env src/index.js --once
```

3. Start the continuous watcher:

```bash
node --env-file=.env src/index.js
```

## Config

- Secrets and runtime settings: `.env`
- Stores list: `config/stores.json`
- For cloud runs, `EBAY_COOKIE_HEADER` can be provided as an environment variable instead of `data/ebay-cookies.json`

## GitHub Actions

The repo includes [`.github/workflows/watcher.yml`](/Users/dne/Documents/EbayWatcher/.github/workflows/watcher.yml) for free scheduled runs on GitHub Actions.

Required repository secrets:

- `BOT_TOKEN`
- `CHAT_ID`
- `EBAY_COOKIE_HEADER`

The workflow runs every 15 minutes and commits updated [`data/state.json`](/Users/dne/Documents/EbayWatcher/data/state.json) back to the repository.

## Notification format

```text
17:11 Прибыл GOJO SATORU

1 new items in ALIENWARE listed:

Impaired Alienware m17 R5 17, 1.2TB, 16GB RAM, i7-8750H, GeForce GTX 1070 Mobile
Price: $529.99
Link: https://www.ebay.com/itm/135158502954
```

## Notes

- `FIRST_RUN_NOTIFY=false` means the first scan only builds the baseline.
- If eBay invalidates cookies, refresh them locally and update `EBAY_COOKIE_HEADER`.
