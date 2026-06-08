const http = require("node:http");
const { URLSearchParams } = require("node:url");

const PORT = Number(process.env.PORT || 3000);
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const TELEGRAM_THREAD_ID = Number(process.env.TELEGRAM_THREAD_ID || 3);
const MAX_BODY_BYTES = 1024 * 1024;
const TELEGRAM_TEXT_LIMIT = 3900;

const HEADERS_BY_PATH = {
  "/tracker": "Tracker Alert",
  "/health": "Health Alert",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function stripHtml(value) {
  return String(value ?? "")
    .replace(/<a\s+href="([^"]+)"[^>]*>(.*?)<\/a>/gis, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|pre|blockquote)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseSlackText(text) {
  if (!text) return "";

  const placeholders = [];
  const hold = (html) => {
    const key = `\u0000${placeholders.length}\u0000`;
    placeholders.push(html);
    return key;
  };

  let value = String(text)
    .replace(/```([\s\S]*?)```/g, (_, code) => hold(`<pre>${escapeHtml(code.trim())}</pre>`))
    .replace(/`([^`\n]+)`/g, (_, code) => hold(`<code>${escapeHtml(code)}</code>`))
    .replace(/<((?:https?:\/\/|mailto:)[^>|]+)\|([^>]+)>/g, (_, url, label) =>
      hold(`<a href="${escapeAttr(url)}">${escapeHtml(label)}</a>`),
    )
    .replace(/<(https?:\/\/[^>]+)>/g, (_, url) =>
      hold(`<a href="${escapeAttr(url)}">${escapeHtml(url)}</a>`),
    )
    .replace(/<mailto:([^>|]+)(?:\|([^>]+))?>/g, (_, email, label) =>
      hold(`<a href="mailto:${escapeAttr(email)}">${escapeHtml(label || email)}</a>`),
    );

  value = escapeHtml(value)
    .replace(/\*(?!\s)([^*\n]+?)(?<!\s)\*/g, "<b>$1</b>")
    .replace(/_(?!\s)([^_\n]+?)(?<!\s)_/g, "<i>$1</i>")
    .replace(/~(?!\s)([^~\n]+?)(?<!\s)~/g, "<s>$1</s>")
    .replace(/\n/g, "\n");

  placeholders.forEach((html, index) => {
    value = value.replaceAll(escapeHtml(`\u0000${index}\u0000`), html);
  });

  return value;
}

function pushLine(lines, value = "") {
  if (value !== undefined && value !== null && String(value).trim() !== "") {
    lines.push(String(value));
  }
}

function renderTextObject(textObject) {
  if (!textObject) return "";
  if (typeof textObject === "string") return parseSlackText(textObject);
  return parseSlackText(textObject.text || "");
}

function renderAttachment(attachment, images) {
  const lines = [];

  pushLine(lines, renderTextObject(attachment.pretext));

  if (attachment.author_name) {
    const author = attachment.author_link
      ? `<a href="${escapeAttr(attachment.author_link)}">${escapeHtml(attachment.author_name)}</a>`
      : escapeHtml(attachment.author_name);
    pushLine(lines, author);
  }

  if (attachment.title) {
    const title = attachment.title_link
      ? `<a href="${escapeAttr(attachment.title_link)}"><b>${escapeHtml(attachment.title)}</b></a>`
      : `<b>${escapeHtml(attachment.title)}</b>`;
    pushLine(lines, title);
  }

  pushLine(lines, renderTextObject(attachment.text));

  if (Array.isArray(attachment.fields)) {
    for (const field of attachment.fields) {
      const title = field.title ? `<b>${escapeHtml(field.title)}</b>: ` : "";
      pushLine(lines, `${title}${renderTextObject(field.value)}`);
    }
  }

  if (attachment.footer || attachment.ts) {
    const pieces = [];
    if (attachment.footer) pieces.push(escapeHtml(attachment.footer));
    if (attachment.ts && Number.isFinite(Number(attachment.ts))) {
      pieces.push(escapeHtml(new Date(Number(attachment.ts) * 1000).toISOString()));
    }
    pushLine(lines, pieces.join(" | "));
  }

  if (attachment.image_url) images.push({ url: attachment.image_url, caption: attachment.title || "" });
  if (attachment.thumb_url) images.push({ url: attachment.thumb_url, caption: attachment.title || "" });

  return lines.join("\n");
}

function renderBlock(block, images) {
  if (!block || typeof block !== "object") return "";

  if (block.type === "section") {
    const lines = [];
    pushLine(lines, renderTextObject(block.text));
    if (Array.isArray(block.fields)) {
      for (const field of block.fields) pushLine(lines, renderTextObject(field));
    }
    if (block.accessory?.type === "image" && block.accessory.image_url) {
      images.push({ url: block.accessory.image_url, caption: block.accessory.alt_text || "" });
    }
    return lines.join("\n");
  }

  if (block.type === "context" && Array.isArray(block.elements)) {
    return block.elements
      .map((element) => {
        if (element.type === "image" && element.image_url) {
          images.push({ url: element.image_url, caption: element.alt_text || "" });
          return "";
        }
        return renderTextObject(element);
      })
      .filter(Boolean)
      .join(" | ");
  }

  if (block.type === "image" && block.image_url) {
    images.push({ url: block.image_url, caption: block.title?.text || block.alt_text || "" });
    return renderTextObject(block.title);
  }

  if (block.type === "divider") return "----------------";

  if (block.type === "actions" && Array.isArray(block.elements)) {
    return block.elements
      .map((element) => {
        if (element.url && element.text?.text) {
          return `<a href="${escapeAttr(element.url)}">${escapeHtml(element.text.text)}</a>`;
        }
        return renderTextObject(element.text);
      })
      .filter(Boolean)
      .join(" | ");
  }

  return renderTextObject(block.text);
}

function normalizePayload(payload) {
  if (payload && typeof payload === "object" && typeof payload.payload === "string") {
    try {
      return JSON.parse(payload.payload);
    } catch {
      return payload;
    }
  }

  return payload;
}

function renderMessage(payload, path) {
  const normalized = normalizePayload(payload);
  const images = [];
  const lines = [];
  const header = HEADERS_BY_PATH[path];

  if (header) pushLine(lines, `<b>${escapeHtml(header)}</b>`);

  if (typeof normalized === "string") {
    pushLine(lines, parseSlackText(normalized));
  } else if (normalized && typeof normalized === "object") {
    pushLine(lines, renderTextObject(normalized.text));

    const attachments =
      typeof normalized.attachments === "string"
        ? safeJsonParse(normalized.attachments, [])
        : normalized.attachments;
    if (Array.isArray(attachments)) {
      for (const attachment of attachments) pushLine(lines, renderAttachment(attachment, images));
    }

    const blocks = typeof normalized.blocks === "string" ? safeJsonParse(normalized.blocks, []) : normalized.blocks;
    if (Array.isArray(blocks)) {
      for (const block of blocks) pushLine(lines, renderBlock(block, images));
    }
  }

  return {
    text: lines.filter(Boolean).join("\n\n").trim(),
    images,
  };
}

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function chunksFromText(html) {
  if (html.length <= TELEGRAM_TEXT_LIMIT) return [html];

  const plain = stripHtml(html);
  const chunks = [];
  for (let index = 0; index < plain.length; index += TELEGRAM_TEXT_LIMIT) {
    chunks.push(escapeHtml(plain.slice(index, index + TELEGRAM_TEXT_LIMIT)));
  }
  return chunks;
}

async function callTelegram(method, body) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  }

  const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      message_thread_id: TELEGRAM_THREAD_ID,
      ...body,
    }),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Telegram ${method} failed: ${response.status} ${responseText}`);
  }
}

async function sendMessage(text) {
  for (const chunk of chunksFromText(text)) {
    try {
      await callTelegram("sendMessage", {
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      });
    } catch (error) {
      await callTelegram("sendMessage", {
        text: stripHtml(chunk),
        disable_web_page_preview: false,
      });
    }
  }
}

async function sendImages(images) {
  for (const image of images) {
    await callTelegram("sendPhoto", {
      photo: image.url,
      caption: image.caption ? stripHtml(parseSlackText(image.caption)).slice(0, 1024) : undefined,
    });
  }
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_BYTES) {
        reject(new Error("Request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function parseBody(rawBody, contentType) {
  if (!rawBody) return {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  if (contentType.includes("application/json")) {
    return safeJsonParse(rawBody, rawBody);
  }

  return safeJsonParse(rawBody, rawBody);
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST") {
    sendJson(response, 405, { ok: false, error: "method_not_allowed" });
    return;
  }

  try {
    const path = new URL(request.url, `http://${request.headers.host || "localhost"}`).pathname;
    if (!HEADERS_BY_PATH[path]) {
      sendJson(response, 202, { ok: true, skipped: true });
      return;
    }

    const rawBody = await readBody(request);
    const payload = parseBody(rawBody, request.headers["content-type"] || "");
    const message = renderMessage(payload, path);

    if (!message.text && message.images.length === 0) {
      sendJson(response, 202, { ok: true, skipped: true });
      return;
    }

    if (message.text) await sendMessage(message.text);
    await sendImages(message.images);

    sendJson(response, 200, { ok: true });
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { ok: false, error: "telegram_delivery_failed" });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`slagram listening on ${PORT}`);
});
