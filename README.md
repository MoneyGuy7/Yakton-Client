# Yakton Client

Landing page + download site for **client.yakton.net**, running on a single
Cloudflare Worker. No build step, no framework — one JS file.

- `/` — the landing page (logo, features, Download button)
- `/download` — redirects to whatever URL is currently configured
- `/admin` — small, password-protected panel to change what the Download
  button points to
- The admin password is a Cloudflare Worker **secret**, not something baked
  into the code — see "Changing the admin password" below.

## 1. Install Wrangler & log in

```bash
npm install
npx wrangler login
```

This opens a browser tab to authorize Wrangler (Cloudflare's CLI) against
your Cloudflare account.

## 2. Create the KV namespace

The current download URL/label is stored in Workers KV so it survives
deploys and can be changed from `/admin` without touching code.

```bash
npx wrangler kv namespace create CONFIG_KV
```

This prints something like:

```
[[kv_namespaces]]
binding = "CONFIG_KV"
id = "abcd1234..."
```

Copy that `id` into `wrangler.toml`, replacing `REPLACE_WITH_KV_NAMESPACE_ID`.

## 3. Set the secrets

```bash
npx wrangler secret put ADMIN_PASSWORD
# then type the password you want, press enter

npx wrangler secret put SESSION_SECRET
# then type any long random string (e.g. output of `openssl rand -hex 32`)
```

- `ADMIN_PASSWORD` is what you type on `/admin` to log in.
- `SESSION_SECRET` signs the admin login cookie. It can be any random
  string — you never need to remember it, you just need it to exist.

Secrets are encrypted and stored by Cloudflare, not in this repo, so this
is safe to push to a public GitHub repo.

## 4. Deploy

```bash
npx wrangler deploy
```

This gives you a `*.workers.dev` URL you can test immediately.

## 5. Point client.yakton.net at it

Easiest path (Cloudflare dashboard):

1. Make sure `yakton.net` is added as a zone in your Cloudflare account.
2. Go to **Workers & Pages → yakton-client → Settings → Domains & Routes**.
3. Click **Add → Custom Domain**, enter `client.yakton.net`, confirm.

Cloudflare creates the DNS record and certificate for you automatically.

(Alternative: manage the DNS record yourself and use the `routes` block
that's commented out in `wrangler.toml` instead of a Custom Domain.)

## Changing the admin password later

Run this any time — it overwrites the old value, no code changes needed:

```bash
npx wrangler secret put ADMIN_PASSWORD
```

Changing `SESSION_SECRET` the same way will instantly log out anyone
currently signed into `/admin`.

## Changing what the Download button downloads

Two ways:

1. Go to `https://client.yakton.net/admin`, log in, paste the new URL
   (e.g. a fresh release asset link), optionally change the button label,
   click Save. Takes effect immediately, no deploy needed.
2. Or set it directly from the CLI:

```bash
npx wrangler kv key put --binding=CONFIG_KV "download_url" "https://your-new-file-url"
npx wrangler kv key put --binding=CONFIG_KV "download_label" "Yakton Client v1.2"
```

## Local development

```bash
npm run dev
```

Wrangler will ask you to create a `.dev.vars` file (gitignored) for local
secrets, e.g.:

```
ADMIN_PASSWORD=devpassword
SESSION_SECRET=devsecretdevsecretdevsecret
```

## Project layout

```
src/index.js   worker logic: routing, landing page, admin panel, auth
src/logo.js    embedded base64 of the logo (served at /logo.png)
wrangler.toml  Worker config (KV binding, routes)
package.json   npm scripts for wrangler
```
