const ORIGIN = "http://origin-api.play-vertex.com:25798";

const ALLOWED_ORIGINS = new Set([
  "https://web.play-vertex.com",
  "https://play-vertex.shop",
  "https://www.play-vertex.shop",
  "https://vertexcrafts1-design.github.io"
]);

const SESSION_SECONDS = 60 * 60 * 8;
const STRIPE_TOLERANCE_SECONDS = 300;

const PUBLIC_API_ROUTES = new Set([
  "/api/public/health",
  "/api/public/exists",
  "/api/public/player",
  "/api/public/stats"
]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsHeaders(request.headers.get("Origin"));

    // IMPORTANT: Stripe webhook is intentionally the FIRST real route.
    // It must never fall through to dashboard bearer authentication.
    if (url.pathname === "/stripe/webhook") {
      if (request.method !== "POST") {
        return stripeJson({
          error: "method_not_allowed",
          route: "stripe_webhook",
          version: "3.4.1"
        }, 405);
      }

      return stripeWebhook(request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "VertexCraft Dashboard API",
        version: "3.4.1",
        shopWebhook: true
      }, 200, cors);
    }

    // Public read-only routes for website leaderboard + shop player validation.
    if (PUBLIC_API_ROUTES.has(url.pathname)) {
      if (request.method !== "GET") {
        return json({ error: "method_not_allowed" }, 405, cors);
      }
      return proxyOrigin(url.pathname, "GET", url.search, null, env, cors, false);
    }

    if (url.pathname === "/auth/login" && request.method === "POST") {
      return login(request, env, cors);
    }

    // Dashboard auth starts ONLY here. Stripe and public API routes above
    // can never reach this block.
    const session = await readBearerSession(request, env.SESSION_SECRET);
    if (!session) {
      return json({ error: "unauthorized", message: "Login required" }, 401, cors);
    }

    if (url.pathname === "/auth/me" && request.method === "GET") {
      return json({
        authenticated: true,
        user: session.user,
        role: session.role,
        expiresAt: session.exp
      }, 200, cors);
    }

    if (url.pathname === "/auth/logout" && request.method === "POST") {
      return json({ ok: true }, 200, cors);
    }

    if (url.pathname === "/system/status" && request.method === "GET") {
      const originHealth = await originRequest("/health", "GET", "", env, null, false);
      const shopHealth = await originRequest("/api/shop/health", "GET", "", env, null, true);
      return json({
        ok: originHealth.ok,
        worker: { ok: true, version: "3.4.1" },
        origin: originHealth,
        shop: shopHealth,
        user: { name: session.user, role: session.role },
        permissions: permissionsFor(session.role)
      }, originHealth.ok ? 200 : 502, cors);
    }

    const isAdmin = session.role === "owner" || session.role === "dev";

    if (url.pathname.startsWith("/manage/")) {
      if (!isAdmin) {
        return json({ error: "forbidden", message: "Owner or developer required" }, 403, cors);
      }
      if (request.method !== "POST") {
        return json({ error: "method_not_allowed" }, 405, cors);
      }

      const targetPath =
        url.pathname === "/manage/delete" ? "/api/manage/delete" :
        url.pathname === "/manage/unban" ? "/api/manage/unban" :
        null;

      if (!targetPath) {
        return json({ error: "not_found" }, 404, cors);
      }

      const body = await request.text();
      return proxyOrigin(targetPath, "POST", url.search, body, env, cors, true);
    }

    if (request.method !== "GET") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    const allowed =
      url.pathname === "/api/punishments" ||
      url.pathname === "/api/players" ||
      url.pathname.startsWith("/api/player/") ||
      url.pathname.startsWith("/api/profile/");

    if (!allowed) {
      return json({ error: "not_found" }, 404, cors);
    }

    return proxyOrigin(url.pathname, "GET", url.search, null, env, cors, false);
  }
};

async function stripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return stripeJson({ error: "missing_stripe_webhook_secret" }, 500);
  }

  const signature = request.headers.get("stripe-signature") || "";
  const rawBody = await request.text();

  const valid = await verifyStripeSignature(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    return stripeJson({ error: "invalid_signature" }, 400);
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return stripeJson({ error: "invalid_json" }, 400);
  }

  if (!event || !event.type || !event.data?.object) {
    return stripeJson({ error: "invalid_event" }, 400);
  }

  const acceptedTypes = new Set([
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded"
  ]);

  if (!acceptedTypes.has(event.type)) {
    return stripeJson({ received: true, ignored: true, type: event.type }, 200);
  }

  const session = event.data.object;

  // Both accepted events must carry a settled payment status.
  const paymentStatus = String(session.payment_status || "");
  if (paymentStatus !== "paid" && paymentStatus !== "no_payment_required") {
    return stripeJson({ received: true, waiting: true, payment_status: paymentStatus }, 200);
  }

  const player = extractMinecraftName(session);
  const paymentLink = typeof session.payment_link === "string"
    ? session.payment_link
    : session.payment_link?.id || "";

  // Player names are interpolated into server commands by the fulfillment plugin.
  // Keep Floodgate's dot prefix, while rejecting whitespace and command characters.
  if (player.length > 32 || !/^\.?[A-Za-z0-9_]{1,32}$/.test(player)) {
    return stripeJson({ error: "invalid_minecraft_name", sessionId: session.id || null }, 422);
  }

  console.log("[StripeWebhook] event=", event.type, "session=", session.id || "-", "player=", player || "-", "paymentLink=", paymentLink || "-");

  if (!session.id || !player || !paymentLink) {
    // Non-2xx makes Stripe retry while you still have the event in the Dashboard.
    return stripeJson({
      error: "missing_fulfillment_data",
      sessionId: session.id || null,
      player: player || null,
      paymentLink: paymentLink || null
    }, 422);
  }

  const payload = JSON.stringify({
    eventId: event.id || "",
    sessionId: session.id,
    paymentLink,
    player,
    amountTotal: Number.isFinite(Number(session.amount_total)) ? Number(session.amount_total) : -1,
    currency: String(session.currency || "")
  });

  const origin = await originRequest(
    "/api/shop/fulfill",
    "POST",
    "",
    env,
    payload,
    true
  );

  console.log("[StripeWebhook] origin status=", origin.status, "ok=", origin.ok);

  if (!origin.ok) {
    // Important: return non-2xx so Stripe retries. The Minecraft plugin itself
    // deduplicates by Checkout Session ID, so a retry cannot deliver twice.
    return stripeJson({
      error: "minecraft_fulfillment_failed",
      originStatus: origin.status,
      originBody: safeBody(origin.body)
    }, 502);
  }

  let fulfillment = null;
  try { fulfillment = JSON.parse(origin.body); } catch {}

  return stripeJson({
    received: true,
    fulfilled: true,
    sessionId: session.id,
    result: fulfillment
  }, 200);
}

function extractMinecraftName(session) {
  // Future dynamic Checkout Sessions can put it in metadata.
  const metadataName = String(session.metadata?.minecraft_name || "").trim();
  if (metadataName) return metadataName;

  const fields = Array.isArray(session.custom_fields) ? session.custom_fields : [];
  for (const field of fields) {
    if (String(field?.key || "").toLowerCase() !== "minecraft_name") continue;
    const value =
      field?.text?.value ??
      field?.numeric?.value ??
      field?.dropdown?.value ??
      "";
    return String(value).trim();
  }
  return "";
}

async function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !secret) return false;

  let timestamp = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "t") timestamp = Number(value);
    if (key === "v1") signatures.push(value.toLowerCase());
  }

  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > STRIPE_TOLERANCE_SECONDS) return false;

  const expected = await hmacHex(`${timestamp}.${rawBody}`, secret);
  for (const candidate of signatures) {
    if (await secureEqual(candidate, expected)) return true;
  }
  return false;
}

async function hmacHex(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );
  return [...new Uint8Array(signature)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function login(request, env, cors) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  const accounts = [
    { user: env.OWNER_USERNAME, pass: env.OWNER_PASSWORD, role: "owner" },
    { user: env.DEV_USERNAME, pass: env.DEV_PASSWORD, role: "dev" },
    { user: env.TEAM_USERNAME, pass: env.TEAM_PASSWORD, role: "team" }
  ];

  let selected = null;
  for (const account of accounts) {
    if (
      account.user &&
      account.pass &&
      await secureEqual(username, account.user) &&
      await secureEqual(password, account.pass)
    ) {
      selected = account;
      break;
    }
  }

  if (!selected) {
    return json({ error: "invalid_credentials" }, 401, cors);
  }

  if (!env.SESSION_SECRET) {
    return json({ error: "missing_session_secret" }, 500, cors);
  }

  const payload = {
    user: selected.user,
    role: selected.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  };

  const token = await createSession(payload, env.SESSION_SECRET);

  return json({
    ok: true,
    user: selected.user,
    role: selected.role,
    token,
    expiresIn: SESSION_SECONDS,
    permissions: permissionsFor(selected.role)
  }, 200, cors);
}

async function proxyOrigin(path, method, search, body, env, cors, manage) {
  const origin = await originRequest(path, method, search, env, body, manage);
  const headers = new Headers(cors);
  headers.set("Content-Type", origin.contentType || "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(origin.body, { status: origin.status, headers });
}

async function originRequest(path, method, search, env, body = null, manage = false) {
  try {
    const headers = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "VertexCraft-Dashboard-Worker/3.4.1"
    };

    if (manage) {
      if (!env.ORIGIN_MANAGE_TOKEN) {
        return {
          ok: false,
          status: 503,
          body: JSON.stringify({ error: "missing_origin_manage_token" }),
          contentType: "application/json"
        };
      }
      headers.Authorization = `Bearer ${env.ORIGIN_MANAGE_TOKEN}`;
    } else if (env.ORIGIN_READ_TOKEN) {
      // Also protect the origin for the public website routes; only the Worker is public.
      headers.Authorization = `Bearer ${env.ORIGIN_READ_TOKEN}`;
    }

    const response = await fetch(ORIGIN + path + search, {
      method,
      headers,
      body: method === "POST" ? body : undefined
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      body: text,
      contentType: response.headers.get("Content-Type") || "application/json"
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: JSON.stringify({
        error: "origin_unreachable",
        message: String(error)
      }),
      contentType: "application/json"
    };
  }
}

function permissionsFor(role) {
  return {
    readDashboard: true,
    searchPlayers: true,
    viewPunishments: true,
    managePunishments: role === "owner" || role === "dev",
    viewSystem: role === "owner" || role === "dev",
    owner: role === "owner"
  };
}

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Cache-Control": "no-store"
  };

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

async function createSession(payload, secret) {
  const data = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmac(data, secret);
  return `${data}.${signature}`;
}

async function readBearerSession(request, secret) {
  if (!secret) return null;

  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;

  const token = authorization.slice(7).trim();
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = await hmac(data, secret);
  if (!(await secureEqual(signature, expected))) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64urlDecode(data))
    );

    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

async function hmac(value, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  );

  return base64url(new Uint8Array(signature));
}

async function secureEqual(a, b) {
  const left = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(a ?? "")))
  );
  const right = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(b ?? "")))
  );

  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function base64url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecode(value) {
  value = value.replace(/-/g, "+").replace(/_/g, "/");
  while (value.length % 4) value += "=";
  const raw = atob(value);
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

function safeBody(value) {
  const text = String(value || "");
  return text.length > 500 ? text.slice(0, 500) + "…" : text;
}

function stripeJson(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function json(data, status, headers) {
  const outputHeaders = new Headers(headers);
  outputHeaders.set("Content-Type", "application/json; charset=utf-8");
  outputHeaders.set("X-Content-Type-Options", "nosniff");
  return new Response(JSON.stringify(data), {
    status,
    headers: outputHeaders
  });
}
