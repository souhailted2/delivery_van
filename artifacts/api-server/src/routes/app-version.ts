import { Router } from "express";

const router = Router();

interface ReleaseInfo {
  tag: string;
  buildNumber: number;
  downloadUrl: string;
  releaseUrl: string;
}

interface CacheEntry {
  ts: number;
  data: ReleaseInfo;
}

let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  html_url: string;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
}

async function fetchLatestAndroidRelease(): Promise<ReleaseInfo> {
  const res = await fetch(
    "https://api.github.com/repos/souhailted2/delivery_van/releases?per_page=10",
    {
      headers: {
        "User-Agent": "erp-van-sales-server/1.0",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );
  if (!res.ok) throw new Error(`GitHub API ${res.status}`);

  const releases = (await res.json()) as GithubRelease[];

  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    const apk = release.assets.find((a) => a.name.endsWith(".apk"));
    if (!apk) continue;

    // Derive buildNumber from tag name (build-N) or embedded comment in body
    let buildNumber = 0;
    const tagMatch = release.tag_name.match(/^build-(\d+)$/);
    if (tagMatch) {
      buildNumber = parseInt(tagMatch[1], 10);
    } else {
      // CI embeds <!-- buildNumber:N --> in the release body for v* tags
      const bodyMatch = release.body?.match(/<!--\s*buildNumber:(\d+)\s*-->/);
      if (bodyMatch) buildNumber = parseInt(bodyMatch[1], 10);
    }

    return {
      tag: release.tag_name,
      buildNumber,
      downloadUrl: apk.browser_download_url,
      releaseUrl: release.html_url,
    };
  }

  throw new Error("No suitable release found");
}

/**
 * GET /api/app/version
 * Returns info about the latest published Android APK release.
 * Used by the mobile app's useUpdateCheck hook to detect when a new APK is
 * available and prompt the user to download it.
 * Requires auth (mounted after requireAuth in routes/index.ts).
 * Caches the GitHub API response for 1 hour to avoid rate-limiting.
 */
router.get("/app/version", async (_req, res) => {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return res.json(cache.data);
  }
  try {
    const data = await fetchLatestAndroidRelease();
    cache = { ts: now, data };
    return res.json(data);
  } catch (err) {
    // Return stale cache on error so transient GitHub API issues don't 503 clients
    if (cache) return res.json(cache.data);
    return res.status(503).json({ error: "تعذّر جلب معلومات التحديث" });
  }
});

export default router;
