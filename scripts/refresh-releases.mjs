import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { projects } from '../src/data/projects.ts';
import { parseLatestRelease } from '../src/lib/github-release.ts';

const siteDir = path.resolve(import.meta.dirname, '..');
const outputPath = path.join(siteDir, 'src/data/release-snapshots.json');

let existing = {};
if (fs.existsSync(outputPath)) {
  try {
    existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')).releases ?? {};
  } catch {
    existing = {};
  }
}

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || (() => {
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
})();

const configs = projects
  .filter(p => Boolean(p.download))
  .map(p => p.download);

const releases = { ...existing };
let updated = 0;

for (const config of configs) {
  const key = config.repository.toLowerCase();
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2026-03-10',
      'User-Agent': 'liss-works-release-snapshot',
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(`https://api.github.com/repos/${config.repository}/releases/latest`, { headers });
    if (!response.ok) {
      console.warn(`[refresh-releases] HTTP ${response.status} for ${config.repository}; keeping existing snapshot if present.`);
      continue;
    }
    const payload = await response.json();
    const parsed = parseLatestRelease(payload, config);
    if (parsed) {
      releases[key] = parsed;
      updated++;
    } else {
      console.warn(`[refresh-releases] No matching single asset in ${config.repository}; keeping existing snapshot if present.`);
    }
  } catch (err) {
    console.warn(`[refresh-releases] Network error for ${config.repository}: ${err.message}`);
  }
}

const ordered = Object.fromEntries(Object.entries(releases).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(outputPath, JSON.stringify({ releases: ordered }, null, 2) + '\n', 'utf8');
console.log(`release snapshots: ${updated}/${configs.length} fetched, ${Object.keys(ordered).length} total stored`);
