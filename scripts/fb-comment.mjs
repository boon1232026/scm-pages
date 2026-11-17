#!/usr/bin/env node
/**
 * fb-comment.mjs — fire comments at a Facebook post/photo targets from the terminal.
 *
 * Uses the real Graph API exactly like the worker: page token is read from the DB
 * (decrypted with TOKEN_ENCRYPTION_KEY) or passed directly with --token.
 *
 * NOTE: content created via the API while the Meta app is in Development mode is
 * only visible to people with a role on the app. This script does not change that.
 *
 * Usage:
 *   node scripts/fb-comment.mjs --photos <fbPostId> --page <fbPageId>
 *     → list photo object IDs under a post (to build the input file)
 *
 *   node scripts/fb-comment.mjs --input comments.json [--page <fbPageId> | --token <t>]
 *     → post every item, with --delay seconds between items (default 30)
 *
 * Input file format (comments.json):
 *   {
 *     "page": "1234567890",            // optional if --page/--token given
 *     "delaySec": 30,                  // optional default delay between comments
 *     "items": [
 *       { "target": "<fbPostId>",          "text": "สวัสดี" },
 *       { "target": "<fbPhotoId>",         "text": "ราคา 199", "imageUrl": "https://…/price.jpg" },
 *       { "target": "<fbPhotoId>",         "imageUrl": "https://…/p.jpg" }
 *     ]
 *   }
 *
 * Flags: --delay <sec>  --dry-run  --stop-on-error  --env <path to .env>
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { createDecipheriv } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

// ---------- args ----------
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};
const has = (name) => args.includes(`--${name}`);

const inputPath = flag("input");
const photosOf = flag("photos");
const pageArg = flag("page");
const tokenArg = flag("token");
const envPath = flag("env") ?? resolve(here, "../apps/api/.env");
const dryRun = has("dry-run");
const stopOnError = has("stop-on-error");

// ---------- .env ----------
function loadEnv(path) {
  const out = {};
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch { /* optional */ }
  return out;
}
const env = { ...loadEnv(envPath), ...process.env };
const GRAPH = `https://graph.facebook.com/${env.META_GRAPH_API_VERSION ?? "v25.0"}`;

// ---------- token ----------
function decryptToken(blob, keyHex) {
  const key = Buffer.from(keyHex, "hex");
  const buf = Buffer.from(blob);
  const decipher = createDecipheriv("aes-256-gcm", key, buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

async function pageTokenFromDb(fbPageId) {
  if (!env.DATABASE_URL || !env.TOKEN_ENCRYPTION_KEY) {
    throw new Error("ต้องการ DATABASE_URL + TOKEN_ENCRYPTION_KEY ใน .env หรือส่ง --token เอง");
  }
  const require = createRequire(resolve(here, "../apps/api/package.json"));
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } });
  try {
    const page = await prisma.socialPage.findFirst({ where: { pageId: String(fbPageId) } });
    if (!page) throw new Error(`ไม่พบเพจ ${fbPageId} ในระบบ`);
    const tok = await prisma.socialToken.findFirst({
      where: { socialPageId: page.id, kind: "page", isValid: true },
      orderBy: { createdAt: "desc" },
    });
    if (!tok) throw new Error(`เพจ ${page.name} ไม่มี page token ที่ใช้ได้ — reconnect Facebook ในแอปก่อน`);
    console.log(`ใช้เพจ: ${page.name} (${fbPageId})`);
    return decryptToken(tok.tokenEncrypted, env.TOKEN_ENCRYPTION_KEY);
  } finally {
    await prisma.$disconnect();
  }
}

// ---------- graph ----------
async function postForm(path, params) {
  const res = await fetch(GRAPH + path, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`Graph ${res.status} code=${e.code ?? "?"}: ${e.message ?? res.statusText}`);
  }
  return data;
}
async function get(path, params) {
  const url = new URL(GRAPH + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error ?? {};
    throw new Error(`Graph ${res.status} code=${e.code ?? "?"}: ${e.message ?? res.statusText}`);
  }
  return data;
}
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

// ---------- list photos ----------
async function listPhotos(fbPostId, pageToken) {
  const res = await get(`/${fbPostId}`, {
    fields: "attachments{subattachments{target{id,url}},target{id,url}}",
    access_token: pageToken,
  });
  const att = res.attachments?.data?.[0];
  const subs = att?.subattachments?.data;
  if (subs?.length) {
    subs.forEach((s, i) => console.log(`รูป ${i + 1}: ${s.target?.id}  ${s.target?.url}`));
  } else if (att?.target?.id) {
    console.log(`รูปเดียว: ${att.target.id}  ${att.target.url}`);
  } else {
    console.log("ไม่พบรูปแนบในโพสต์นี้ (อาจเป็นโพสต์ข้อความ/วิดีโอ)");
  }
}

// ---------- run ----------
async function main() {
  const cfg = inputPath ? JSON.parse(readFileSync(inputPath, "utf8")) : {};
  const fbPageId = pageArg ?? cfg.page;
  const pageToken = tokenArg ?? (fbPageId ? await pageTokenFromDb(fbPageId) : null);
  if (!pageToken) throw new Error("ระบุ --page <fbPageId> หรือ --token <pageToken>");

  if (photosOf) return listPhotos(photosOf, pageToken);
  if (!inputPath) throw new Error("ระบุ --input <file.json> หรือ --photos <fbPostId>");

  const items = cfg.items ?? [];
  if (!items.length) throw new Error("items ว่างในไฟล์ input");
  const delaySec = flag("delay") !== null ? Number(flag("delay")) : Number(cfg.delaySec ?? 30);

  console.log(`จะยิง ${items.length} คอมเมนต์ ห่างกัน ${delaySec}s${dryRun ? " [DRY RUN]" : ""}`);
  let ok = 0, failed = 0;
  for (const [i, item] of items.entries()) {
    const tag = `#${i + 1}/${items.length} → ${item.target}`;
    try {
      if (dryRun) {
        console.log(`${tag}  text=${item.text?.slice(0, 40) ?? "-"} image=${item.imageUrl ? "yes" : "-"}`);
      } else {
        const params = {};
        if (item.text) params.message = item.text;
        if (item.imageUrl) {
          const pageFbId = fbPageId ?? item.target.split("_")[0];
          try {
            const photo = await postForm(`/${pageFbId}/photos`, {
              url: item.imageUrl, published: "false", access_token: pageToken,
            });
            params.attachment_id = photo.id;
          } catch (e) {
            console.log(`${tag}  attachment_id ไม่ได้ (${e.message}) → ลอง attachment_url`);
            params.attachment_url = item.imageUrl;
          }
        }
        const r = await postForm(`/${item.target}/comments`, { ...params, access_token: pageToken });
        console.log(`${tag}  ✓ comment id = ${r.id}`);
      }
      ok++;
    } catch (e) {
      failed++;
      console.log(`${tag}  ✗ ${e.message}`);
      if (stopOnError) break;
    }
    if (!dryRun && i < items.length - 1 && delaySec > 0) await sleep(delaySec);
  }
  console.log(`เสร็จ — สำเร็จ ${ok} ล้มเหลว ${failed}`);
}

main().catch((e) => { console.error("Error:", e.message); process.exit(1); });
