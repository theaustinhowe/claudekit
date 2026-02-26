import type { LatestVersionSource } from "@/lib/types/toolbox";

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface CacheEntry {
  version: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(source: LatestVersionSource): string {
  switch (source.type) {
    case "npm":
      return `npm:${source.package}`;
    case "github-release":
      return `gh:${source.repo}`;
    case "url":
      return `url:${source.url}`;
    case "none":
      return "none";
  }
}

async function fetchWithTimeout(url: string, headers?: Record<string, string>): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timer);
  }
}

async function resolveFromNpm(packageName: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://registry.npmjs.org/${packageName}/latest`);
  if (!res.ok) return null;
  const data = await res.json();
  return data.version || null;
}

async function resolveFromGithubRelease(repo: string): Promise<string | null> {
  const res = await fetchWithTimeout(`https://api.github.com/repos/${repo}/releases/latest`, {
    Accept: "application/vnd.github.v3+json",
  });
  if (!res.ok) return null;
  const data = await res.json();
  const tag: string = data.tag_name || "";
  return tag.replace(/^v/, "");
}

async function resolveFromUrl(url: string, parser: "nodejs-lts" | "python-eol"): Promise<string | null> {
  const res = await fetchWithTimeout(url);
  if (!res.ok) return null;
  const data = await res.json();

  if (parser === "nodejs-lts") {
    const ltsEntry = (data as Array<{ version: string; lts: string | false }>).find((entry) => entry.lts !== false);
    return ltsEntry ? ltsEntry.version.replace(/^v/, "") : null;
  }

  if (parser === "python-eol") {
    const latest = (data as Array<{ latest: string }>)[0];
    return latest?.latest || null;
  }

  return null;
}

export async function resolveLatestVersion(source: LatestVersionSource): Promise<string | null> {
  if (source.type === "none") return null;

  const key = cacheKey(source);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.version;
  }

  try {
    let version: string | null = null;

    switch (source.type) {
      case "npm":
        version = await resolveFromNpm(source.package);
        break;
      case "github-release":
        version = await resolveFromGithubRelease(source.repo);
        break;
      case "url":
        version = await resolveFromUrl(source.url, source.parser);
        break;
    }

    if (version) {
      cache.set(key, { version, fetchedAt: Date.now() });
    }
    return version;
  } catch {
    return null;
  }
}

/** Minimal semver comparison: returns true if latest is newer than current */
export function isNewerVersion(current: string, latest: string): boolean {
  const parseParts = (v: string) => v.replace(/^v/, "").split(".").map(Number);
  const c = parseParts(current);
  const l = parseParts(latest);
  const len = Math.max(c.length, l.length);
  for (let i = 0; i < len; i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}
