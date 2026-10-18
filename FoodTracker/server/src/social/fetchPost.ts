/**
 * Holt Beschreibung (Caption) und Vorschaubild eines Instagram- oder TikTok-Posts.
 *
 * Videos selbst lassen sich von diesen Plattformen nicht offiziell herunterladen. Wir nutzen
 * deshalb die öffentlichen oEmbed-Schnittstellen bzw. die Vorschau-Metadaten der Seite.
 * Zusätzlich kann die App Einzelbilder aus einem gespeicherten Video schicken.
 *
 * Nutzer geben beliebige URLs ein, deshalb werden nur bekannte Hosts über HTTPS abgerufen
 * (Schutz vor Server-Side Request Forgery), auch bei Weiterleitungen.
 */

export type Platform = "instagram" | "tiktok";

export interface FetchedImage {
  data: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

export interface SocialPost {
  platform: Platform;
  url: string;
  caption: string | null;
  author: string | null;
  thumbnail: FetchedImage | null;
}

const PAGE_HOSTS = ["instagram.com", "tiktok.com"];
const API_HOSTS = ["www.tiktok.com", "graph.facebook.com"];
const MEDIA_HOSTS = ["tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com", "ibyteimg.com", "cdninstagram.com", "fbcdn.net"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PAGE_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 10_000;

export class SocialFetchError extends Error {
  constructor(readonly code: "unsupported_url" | "fetch_failed") {
    super(code);
  }
}

export function hostMatches(host: string, allowed: string[]): boolean {
  return allowed.some((a) => host === a || host.endsWith(`.${a}`));
}

export function detectPlatform(rawUrl: string): Platform | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (hostMatches(url.hostname, ["instagram.com"])) return "instagram";
  if (hostMatches(url.hostname, ["tiktok.com"])) return "tiktok";
  return null;
}

/** fetch, das jede Weiterleitung erneut gegen die Host-Liste prüft. */
async function safeFetch(rawUrl: string, allowedHosts: string[], init: RequestInit = {}, redirects = 3): Promise<Response> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || !hostMatches(url.hostname, allowedHosts)) throw new SocialFetchError("unsupported_url");
  const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location || redirects === 0) throw new SocialFetchError("fetch_failed");
    return safeFetch(new URL(location, url).toString(), allowedHosts, init, redirects - 1);
  }
  return res;
}

async function readLimited(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  const length = Number(res.headers.get("content-length") ?? 0);
  if (length > maxBytes) return null;
  const buffer = new Uint8Array(await res.arrayBuffer());
  return buffer.byteLength > maxBytes ? null : buffer;
}

async function fetchImage(rawUrl: string | undefined | null): Promise<FetchedImage | null> {
  if (!rawUrl) return null;
  try {
    const res = await safeFetch(rawUrl, MEDIA_HOSTS);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0]!.trim();
    const mediaType = (["image/jpeg", "image/png", "image/webp", "image/gif"] as const).find((t) => t === type);
    const bytes = await readLimited(res, MAX_IMAGE_BYTES);
    if (!mediaType || !bytes) return null;
    return { data: Buffer.from(bytes).toString("base64"), mediaType };
  } catch {
    return null;
  }
}

async function fetchJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await safeFetch(url, API_HOSTS);
    return res.ok ? ((await res.json()) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Liest og:description / og:image aus dem HTML der Seite (Fallback ohne API-Zugang). */
async function fetchOpenGraph(url: string): Promise<{ description: string | null; image: string | null }> {
  try {
    const res = await safeFetch(url, PAGE_HOSTS, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FoodTracker/1.0)" } });
    const bytes = res.ok ? await readLimited(res, MAX_PAGE_BYTES) : null;
    if (!bytes) return { description: null, image: null };
    const html = new TextDecoder().decode(bytes);
    return { description: metaContent(html, "og:description"), image: metaContent(html, "og:image") };
  } catch {
    return { description: null, image: null };
  }
}

export function metaContent(html: string, property: string): string | null {
  const tag = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]*>`, "i"))?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

export async function fetchSocialPost(rawUrl: string): Promise<SocialPost> {
  const platform = detectPlatform(rawUrl);
  if (!platform) throw new SocialFetchError("unsupported_url");

  let caption: string | null = null;
  let author: string | null = null;
  let thumbnailUrl: string | null = null;

  if (platform === "tiktok") {
    // Öffentliche oEmbed-Schnittstelle, kein Schlüssel nötig.
    const oembed = await fetchJson(`https://www.tiktok.com/oembed?url=${encodeURIComponent(rawUrl)}`);
    caption = typeof oembed?.title === "string" ? oembed.title : null;
    author = typeof oembed?.author_name === "string" ? oembed.author_name : null;
    thumbnailUrl = typeof oembed?.thumbnail_url === "string" ? oembed.thumbnail_url : null;
  } else if (process.env.META_OEMBED_TOKEN) {
    // Instagram-oEmbed braucht ein Meta-App-Token (APP_ID|CLIENT_TOKEN).
    const oembed = await fetchJson(
      `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(rawUrl)}&access_token=${encodeURIComponent(process.env.META_OEMBED_TOKEN)}`,
    );
    caption = typeof oembed?.title === "string" ? oembed.title : null;
    author = typeof oembed?.author_name === "string" ? oembed.author_name : null;
    thumbnailUrl = typeof oembed?.thumbnail_url === "string" ? oembed.thumbnail_url : null;
  }

  if (!caption || !thumbnailUrl) {
    const og = await fetchOpenGraph(rawUrl);
    caption ??= og.description;
    thumbnailUrl ??= og.image;
  }

  return { platform, url: rawUrl, caption, author, thumbnail: await fetchImage(thumbnailUrl) };
}
