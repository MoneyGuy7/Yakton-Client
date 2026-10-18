import { LOGO_PNG_BASE64 } from "./logo.js";

/**
 * Yakton Client — Cloudflare Worker
 * -----------------------------------------------------------------------
 * A single-worker site for client.yakton.net:
 *   GET  /            -> landing page
 *   GET  /logo.png    -> the embedded logo
 *   GET  /download    -> redirects to whatever download URL is currently
 *                        configured (set from the admin panel, stored in KV)
 *   GET  /admin       -> tiny password-gated admin panel
 *   POST /admin/login -> checks the password, sets a signed session cookie
 *   POST /admin/save  -> updates the download URL / label (session required)
 *   POST /admin/logout
 *
 * CONFIGURATION (see README.md for full setup):
 *   - KV namespace binding: CONFIG_KV
 *       key "download_url"   -> the URL the Download button sends people to
 *       key "download_label" -> optional label shown under the button
 *   - Secret:  ADMIN_PASSWORD   (wrangler secret put ADMIN_PASSWORD)
 *   - Secret:  SESSION_SECRET   (wrangler secret put SESSION_SECRET)
 *       Random string used to sign the admin session cookie. Rotating it
 *       instantly logs out any existing admin session.
 *
 * To change the admin password later, you never edit this file — just run:
 *   wrangler secret put ADMIN_PASSWORD
 * and type the new password. That's the "variable" referenced in the
 * project brief: it lives in the Worker's encrypted secrets, not in code.
 */

const SESSION_COOKIE = "yakton_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const DEFAULT_DOWNLOAD_URL = "https://example.com/yakton-client-setup.exe";
const DEFAULT_DOWNLOAD_LABEL = "Yakton Client Installer";

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=UTF-8" },
  });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  const match = header.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Session token = "<expiry>.<hmac(expiry, SESSION_SECRET)>"
async function makeSessionToken(env) {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(expiry)));
  return `${expiry}.${toHex(sig)}`;
}

async function isValidSession(env, token) {
  if (!token) return false;
  const [expiryStr, sig] = token.split(".");
  if (!expiryStr || !sig) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Math.floor(Date.now() / 1000)) return false;

  const key = await hmacKey(env.SESSION_SECRET);
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(expiryStr));
  return toHex(expected) === sig;
}

function sessionCookieHeader(token, maxAge) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function requireAuth(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  return isValidSession(env, token);
}

async function getConfig(env) {
  const [url, label] = await Promise.all([
    env.CONFIG_KV.get("download_url"),
    env.CONFIG_KV.get("download_label"),
  ]);
  return {
    url: url || DEFAULT_DOWNLOAD_URL,
    label: label || DEFAULT_DOWNLOAD_LABEL,
  };
}

// ---------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------

const FEATURES = [
  {
    title: "Blazing Fast Launch",
    desc: "Optimized startup so you're in-game in seconds, not minutes.",
  },
  {
    title: "Clean, Modern UI",
    desc: "No clutter, no ads inside the client — just the tools you actually use.",
  },
  {
    title: "Auto-Updating",
    desc: "The client keeps itself current, so you always have the latest build.",
  },
  {
    title: "Lightweight Footprint",
    desc: "Runs smoothly even on lower-end machines without eating your RAM.",
  },
  {
    title: "Custom Themes",
    desc: "Personalize the look and feel to match your setup.",
  },
  {
    title: "Built-In Performance Tools",
    desc: "FPS counter, resource monitor, and quick-toggle settings baked in.",
  },
];

function pageShell({ title, body, extraHead = "" }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
${extraHead}
<style>
  :root {
    --bg: #0b0c10;
    --bg-elev: #15171d;
    --border: #262a33;
    --text: #f2f3f5;
    --muted: #9aa0ab;
    --accent: #ffffff;
    --accent-dim: #c9cbd1;
  }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    padding: 0;
    background: radial-gradient(1200px 600px at 50% -10%, #1b1e27 0%, var(--bg) 55%);
    color: var(--text);
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    min-height: 100%;
  }
  a { color: inherit; }
  .wrap {
    max-width: 880px;
    margin: 0 auto;
    padding: 64px 24px 48px;
  }
  header.hero {
    text-align: center;
    margin-bottom: 56px;
  }
  header.hero img.logo {
    width: 140px;
    height: 140px;
    object-fit: contain;
    filter: drop-shadow(0 0 30px rgba(255,255,255,0.08));
  }
  header.hero h1 {
    font-size: 2.6rem;
    letter-spacing: 0.08em;
    margin: 18px 0 8px;
    font-weight: 800;
  }
  header.hero p.tagline {
    color: var(--muted);
    font-size: 1.05rem;
    margin: 0 auto;
    max-width: 480px;
  }
  .download-btn {
    display: inline-block;
    margin-top: 28px;
    padding: 16px 42px;
    background: var(--accent);
    color: #0b0c10;
    font-weight: 700;
    font-size: 1.05rem;
    border-radius: 10px;
    text-decoration: none;
    letter-spacing: 0.02em;
    transition: transform 0.12s ease, box-shadow 0.12s ease;
    box-shadow: 0 8px 30px rgba(255,255,255,0.08);
  }
  .download-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 36px rgba(255,255,255,0.14); }
  .download-sub {
    display: block;
    margin-top: 10px;
    color: var(--muted);
    font-size: 0.85rem;
  }
  .features {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 18px;
    margin-top: 16px;
  }
  .feature {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
  }
  .feature h3 {
    margin: 0 0 8px;
    font-size: 1.02rem;
  }
  .feature p {
    margin: 0;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.45;
  }
  .section-title {
    text-align: center;
    font-size: 1.4rem;
    letter-spacing: 0.04em;
    margin: 0 0 24px;
  }
  footer {
    text-align: center;
    margin-top: 72px;
    padding-top: 20px;
    border-top: 1px solid var(--border);
  }
  .admin-link {
    display: inline-block;
    font-size: 0.72rem;
    color: #4a4f5a;
    text-decoration: none;
    padding: 6px 10px;
    border-radius: 6px;
  }
  .admin-link:hover { color: var(--muted); }

  /* Admin panel */
  .admin-wrap {
    max-width: 440px;
    margin: 80px auto;
    padding: 0 24px;
  }
  .card {
    background: var(--bg-elev);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 32px;
  }
  .card h2 { margin-top: 0; font-size: 1.2rem; }
  label { display: block; font-size: 0.85rem; color: var(--muted); margin: 18px 0 6px; }
  input[type=password], input[type=text], input[type=url] {
    width: 100%;
    padding: 12px 14px;
    background: #0e1015;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--text);
    font-size: 0.95rem;
  }
  button.primary {
    margin-top: 22px;
    width: 100%;
    padding: 12px 14px;
    background: var(--accent);
    color: #0b0c10;
    border: none;
    border-radius: 8px;
    font-weight: 700;
    font-size: 0.95rem;
    cursor: pointer;
  }
  .msg { margin-top: 14px; font-size: 0.85rem; }
  .msg.error { color: #ff6b6b; }
  .msg.ok { color: #6bff9d; }
  .top-link { display:block; text-align:center; margin-bottom: 18px; color: var(--muted); font-size: 0.8rem; text-decoration:none; }
  .logout { text-align:center; margin-top: 16px; }
  .logout a { color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

function landingPage(config) {
  const featureCards = FEATURES.map(
    (f) => `
      <div class="feature">
        <h3>${f.title}</h3>
        <p>${f.desc}</p>
      </div>`
  ).join("");

  const body = `
  <div class="wrap">
    <header class="hero">
      <img class="logo" src="/logo.png" alt="Yakton Client logo" />
      <h1>YAKTON CLIENT</h1>
      <p class="tagline">A faster, cleaner way to play. Built for players who want their client to just work.</p>
      <a class="download-btn" href="/download">Download ${escapeHtml(config.label)}</a>
      <span class="download-sub">Free &middot; Updated regularly</span>
    </header>

    <h2 class="section-title">Why Yakton Client</h2>
    <div class="features">${featureCards}</div>

    <footer>
      <a class="admin-link" href="/admin">&bull;</a>
    </footer>
  </div>`;

  return pageShell({ title: "Yakton Client", body });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function adminLoginPage({ error } = {}) {
  const body = `
  <div class="admin-wrap">
    <a class="top-link" href="/">&larr; back to site</a>
    <div class="card">
      <h2>Admin Login</h2>
      <form method="POST" action="/admin/login">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autofocus required />
        <button class="primary" type="submit">Sign in</button>
      </form>
      ${error ? `<p class="msg error">${escapeHtml(error)}</p>` : ""}
    </div>
  </div>`;
  return pageShell({ title: "Admin — Yakton Client", body });
}

function adminPanelPage(config, { saved } = {}) {
  const body = `
  <div class="admin-wrap">
    <a class="top-link" href="/">&larr; back to site</a>
    <div class="card">
      <h2>Download settings</h2>
      <form method="POST" action="/admin/save">
        <label for="url">Download URL</label>
        <input type="url" id="url" name="url" value="${escapeHtml(config.url)}" required />

        <label for="label">Button label (optional)</label>
        <input type="text" id="label" name="label" value="${escapeHtml(config.label)}" />

        <button class="primary" type="submit">Save</button>
      </form>
      ${saved ? `<p class="msg ok">Saved. The download button now points here.</p>` : ""}
      <p class="msg" style="color:#6b7280">
        To change the admin password, run <code>wrangler secret put ADMIN_PASSWORD</code>
        in the project — it's never stored in this page or in the code.
      </p>
      <div class="logout"><a href="/admin/logout">Log out</a></div>
    </div>
  </div>`;
  return pageShell({ title: "Admin — Yakton Client", body });
}

// ---------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    try {
      if (request.method === "GET" && pathname === "/") {
        const config = await getConfig(env);
        return html(landingPage(config));
      }

      if (request.method === "GET" && pathname === "/logo.png") {
        const bytes = Uint8Array.from(atob(LOGO_PNG_BASE64), (c) => c.charCodeAt(0));
        return new Response(bytes, {
          headers: {
            "content-type": "image/png",
            "cache-control": "public, max-age=86400",
          },
        });
      }

      if (request.method === "GET" && pathname === "/download") {
        const config = await getConfig(env);
        return Response.redirect(config.url, 302);
      }

      if (pathname === "/admin" && request.method === "GET") {
        const authed = await requireAuth(request, env);
        if (!authed) return html(adminLoginPage());
        const config = await getConfig(env);
        return html(adminPanelPage(config, { saved: url.searchParams.get("saved") === "1" }));
      }

      if (pathname === "/admin/login" && request.method === "POST") {
        const form = await request.formData();
        const password = form.get("password") || "";

        if (!env.ADMIN_PASSWORD) {
          return html(adminLoginPage({ error: "ADMIN_PASSWORD secret is not configured." }), 500);
        }

        if (password !== env.ADMIN_PASSWORD) {
          return html(adminLoginPage({ error: "Incorrect password." }), 401);
        }

        const token = await makeSessionToken(env);
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/admin",
            "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_SECONDS),
          },
        });
      }

      if (pathname === "/admin/save" && request.method === "POST") {
        const authed = await requireAuth(request, env);
        if (!authed) return html(adminLoginPage({ error: "Session expired, please log in again." }), 401);

        const form = await request.formData();
        const newUrl = (form.get("url") || "").toString().trim();
        const newLabel = (form.get("label") || "").toString().trim();

        if (!newUrl) {
          const config = await getConfig(env);
          return html(adminPanelPage(config));
        }

        await env.CONFIG_KV.put("download_url", newUrl);
        if (newLabel) {
          await env.CONFIG_KV.put("download_label", newLabel);
        }

        return Response.redirect(new URL("/admin?saved=1", url).toString(), 303);
      }

      if (pathname === "/admin/logout" && request.method === "GET") {
        return new Response(null, {
          status: 303,
          headers: {
            Location: "/",
            "Set-Cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
          },
        });
      }

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return new Response("Internal error: " + (err && err.message ? err.message : String(err)), {
        status: 500,
      });
    }
  },
};
