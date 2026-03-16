const ARRIVAL_TEXT = "Прибыл GOJO SATORU";
const MAX_MESSAGE_LENGTH = 4000;

function buildHeader(now = new Date()) {
  const time = new Intl.DateTimeFormat("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Europe/Lisbon"
  }).format(now);

  return `${time} ${ARRIVAL_TEXT}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildTelegramMessage(storeName, items) {
  const lines = [
    escapeHtml(buildHeader()),
    "",
    escapeHtml(`${items.length} new items in ${storeName.toUpperCase()} listed:`),
    ""
  ];

  for (const item of items) {
    lines.push(escapeHtml(item.title));
    lines.push(escapeHtml(`Price: ${item.price || "N/A"}`));
    lines.push(escapeHtml(`Link: ${item.url}`));
    lines.push("");
  }

  return lines.join("\n").trim();
}

function chunkLines(lines, maxLength) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;

    if (next.length <= maxLength) {
      current = next;
      continue;
    }

    if (current) {
      chunks.push(current);
    }

    current = line;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

export async function sendTelegramMessage(botToken, chatId, text) {
  const chunks = chunkLines(text.split("\n"), MAX_MESSAGE_LENGTH);

  for (const chunk of chunks) {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: false
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Telegram API error ${response.status}: ${body}`);
    }
  }
}
