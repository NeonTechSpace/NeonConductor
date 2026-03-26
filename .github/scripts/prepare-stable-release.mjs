import fs from "node:fs";
import https from "node:https";
import { execFileSync } from "node:child_process";
import { parseHotfixSyncMetadataComment } from "./hotfix-sync-metadata.mjs";

const GITHUB_API_BASE = new URL("https://api.github.com");
const GITHUB_REPO_SEGMENT_PATTERN = /^[A-Za-z0-9_.-]+$/;
const GITHUB_SHA_PATTERN = /^[a-f0-9]{7,40}$/i;
const GITHUB_USER_AGENT =
  process.env.GITHUB_USER_AGENT || "neonconductor-release-bot/1.0";
const RELEASE_CONFIG_PATH = ".github/release.yml";
const PACKAGE_JSON_PATH = "Project/package.json";
const CHANGELOG_PATH = "Project/CHANGELOG.md";
const RELEASE_BUMP_LABELS = [
  "release:bump:none",
  "release:bump:patch",
  "release:bump:minor",
  "release:bump:major",
];
const RELEASE_BUMP_ORDER = ["none", "patch", "minor", "major"];

const DEFAULT_CATEGORY_CONFIG = [
  { title: "Breaking Changes 💥", labels: ["type: breaking"] },
  { title: "Features 🚀", labels: ["type: feature"] },
  { title: "Bug Fixes 🐞", labels: ["type: bug"] },
  { title: "Refactoring 🛠", labels: ["type: refactor"] },
  { title: "Performance Improvements ⚡️", labels: ["type: performance"] },
  { title: "UI/UX 🎨", labels: ["type: ui-ux"] },
  { title: "Documentation 📚", labels: ["type: docs"] },
  { title: "Tests 🧪", labels: ["type: test"] },
  { title: "Build System 🏗", labels: ["type: build"] },
  { title: "Continuous Integration 🔄", labels: ["type: ci"] },
  { title: "Dependency Updates 📦", labels: ["type: dependencies"] },
  { title: "Chores 🧹", labels: ["type: chore"] },
  { title: "Security 🔐", labels: ["type: security"] },
  { title: "Style 💅", labels: ["type: style"] },
  { title: "Reverts 🔄", labels: ["type: revert"] },
];

const SEMANTIC_TYPE_TO_LABEL = {
  feat: "type: feature",
  fix: "type: bug",
  chore: "type: chore",
  docs: "type: docs",
  refactor: "type: refactor",
  test: "type: test",
  perf: "type: performance",
  "ui-ux": "type: ui-ux",
  build: "type: build",
  ci: "type: ci",
  revert: "type: revert",
};

function readEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  fs.appendFileSync(outputPath, `${name}<<EOF\n${value}\nEOF\n`, "utf8");
}

function runGit(args) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

function revList(range) {
  const raw = runGit(["rev-list", range]);
  return raw
    ? raw
        .split("\n")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];
}

function normalizeRepoSegment(segmentName, value) {
  const normalized = (value || "").trim();
  if (!GITHUB_REPO_SEGMENT_PATTERN.test(normalized)) {
    throw new Error(`Invalid repository ${segmentName}: ${value}`);
  }
  return normalized;
}

function normalizeSha(sha) {
  const normalized = (sha || "").trim();
  return GITHUB_SHA_PATTERN.test(normalized) ? normalized : null;
}

function buildGitHubApiUrl(pathname, query) {
  const url = new URL(pathname, GITHUB_API_BASE);
  if (url.origin !== GITHUB_API_BASE.origin) {
    throw new Error(`Refusing to call non-GitHub API origin: ${url.origin}`);
  }

  if (query) {
    const params = new URLSearchParams(query);
    url.search = params.toString();
  }

  return url;
}

function buildGitHubRepoBasePath(owner, repo) {
  const normalizedOwner = normalizeRepoSegment("owner", owner);
  const normalizedRepo = normalizeRepoSegment("name", repo);
  return `/repos/${encodeURIComponent(normalizedOwner)}/${encodeURIComponent(normalizedRepo)}`;
}

function githubRequest(pathname, { method = "GET", body, query } = {}) {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token)
    throw new Error("Missing GITHUB_TOKEN/GH_TOKEN for GitHub API calls.");
  const url = buildGitHubApiUrl(pathname, query);
  const payload = body ? JSON.stringify(body) : undefined;

  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        method,
        path: `${url.pathname}${url.search}`,
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "User-Agent": GITHUB_USER_AGENT,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(payload
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
              }
            : {}),
        },
      },
      (response) => {
        let responseText = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          responseText += chunk;
        });
        response.on("end", () => {
          const status = response.statusCode || 0;
          if (status < 200 || status >= 300) {
            reject(
              new Error(
                `GitHub API ${method} ${url.pathname}${url.search} failed (${status}): ${responseText}`,
              ),
            );
            return;
          }

          if (status === 204 || responseText.trim() === "") {
            resolve(null);
            return;
          }

          try {
            resolve(JSON.parse(responseText));
          } catch {
            reject(
              new Error(
                `GitHub API ${method} ${url.pathname} returned invalid JSON.`,
              ),
            );
          }
        });
      },
    );

    request.on("error", (error) => reject(error));

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

async function listPullRequestsForCommit(owner, repo, sha) {
  const repoBasePath = buildGitHubRepoBasePath(owner, repo);
  const normalizedSha = normalizeSha(sha);
  if (!normalizedSha) {
    return [];
  }

  try {
    const pulls = await githubRequest(
      `${repoBasePath}/commits/${encodeURIComponent(normalizedSha)}/pulls`,
      { query: { per_page: "100" } },
    );
    return Array.isArray(pulls) ? pulls : [];
  } catch {
    return [];
  }
}

async function getPullRequestByNumber(owner, repo, prNumber) {
  const repoBasePath = buildGitHubRepoBasePath(owner, repo);
  const response = await githubRequest(
    `${repoBasePath}/pulls/${encodeURIComponent(String(prNumber))}`,
  );
  return response && typeof response === "object" ? response : null;
}

async function collectPullRequestsFromRange(owner, repo, range) {
  const commits = revList(range);
  const pullRequestMap = new Map();

  for (const sha of commits) {
    const pullRequests = await listPullRequestsForCommit(owner, repo, sha);
    for (const pr of pullRequests) {
      if (!pr?.number) continue;
      if (!pullRequestMap.has(pr.number)) {
        pullRequestMap.set(pr.number, pr);
      }
    }
  }

  return [...pullRequestMap.values()];
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseReleaseConfig() {
  if (!fs.existsSync(RELEASE_CONFIG_PATH)) {
    return {
      categories: DEFAULT_CATEGORY_CONFIG,
      excludeLabels: ["ignore-for-release"],
    };
  }

  const source = fs
    .readFileSync(RELEASE_CONFIG_PATH, "utf8")
    .replace(/\r\n/g, "\n");
  const categories = [];

  const categoriesMatch = source.match(/categories:\s*\n([\s\S]*)$/m);
  if (categoriesMatch) {
    const lines = categoriesMatch[1].split("\n");
    let current = null;
    let inLabels = false;

    for (const line of lines) {
      const titleMatch = line.match(/^\s*-\s+title:\s*(.+)\s*$/);
      if (titleMatch) {
        if (current) categories.push(current);
        current = { title: unquote(titleMatch[1]), labels: [] };
        inLabels = false;
        continue;
      }

      if (!current) continue;
      if (/^\s*labels:\s*$/.test(line)) {
        inLabels = true;
        continue;
      }

      if (inLabels) {
        const labelMatch = line.match(/^\s*-\s+(.+)\s*$/);
        if (labelMatch) {
          current.labels.push(unquote(labelMatch[1]));
        }
      }
    }

    if (current) categories.push(current);
  }

  const excludeLabels = [];
  const excludeMatch = source.match(
    /exclude:\s*\n\s*labels:\s*\n([\s\S]*?)\n\s*categories:/m,
  );
  if (excludeMatch) {
    for (const line of excludeMatch[1].split("\n")) {
      const labelMatch = line.match(/^\s*-\s+(.+)\s*$/);
      if (labelMatch) excludeLabels.push(unquote(labelMatch[1]));
    }
  }

  if (!excludeLabels.includes("ignore-for-release")) {
    excludeLabels.push("ignore-for-release");
  }

  return {
    categories: categories.length > 0 ? categories : DEFAULT_CATEGORY_CONFIG,
    excludeLabels,
  };
}

function isWrapperPullRequest(pr, excludeLabels) {
  const labels = new Set((pr.labels || []).map((label) => label.name));
  for (const label of excludeLabels) {
    if (labels.has(label)) return true;
  }

  const headRef = pr.head?.ref || "";
  const baseRef = pr.base?.ref || "";
  const title = (pr.title || "").toLowerCase();

  if (headRef === "dev" && baseRef === "prev") return true;
  if (headRef === "prev" && baseRef === "main") return true;
  if (headRef.startsWith("lane-sync/")) return true;
  if (headRef.startsWith("release-bot/")) return true;
  if (headRef.startsWith("release-sync/")) return true;
  if (title.startsWith("release(stable): v")) return true;
  return false;
}

function normalizePrTitle(title) {
  return (title || "").replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim();
}

function semanticLabelFromTitle(title) {
  const match = (title || "").match(
    /^(feat|fix|chore|docs|refactor|test|perf|build|ci|ui-ux|revert)(?:\([^)]+\))?(!)?:\s/i,
  );
  if (!match) return null;
  if (match[2]) return "type: breaking";
  return SEMANTIC_TYPE_TO_LABEL[match[1].toLowerCase()] || null;
}

function categoryFromLabels(labelSet, categories) {
  for (const category of categories) {
    if (category.labels.some((label) => labelSet.has(label))) {
      return category.title;
    }
  }
  return null;
}

function parseReleaseBumpTrailer(body) {
  const match = String(body || "").match(
    /^\s*Release-Bump:\s*(none|patch|minor|major)\s*$/im,
  );
  return match ? match[1].toLowerCase() : "none";
}

function extractReleaseBump(pr) {
  const labels = new Set((pr.labels || []).map((label) => label.name));
  const labelMatch = RELEASE_BUMP_LABELS.find((label) => labels.has(label));
  if (labelMatch) {
    return labelMatch.replace("release:bump:", "");
  }
  return parseReleaseBumpTrailer(pr.body || "");
}

async function resolveReleasePullRequests({
  owner,
  repo,
  pullRequests,
  excludeLabels,
}) {
  const resolvedPullRequests = new Map();
  const seenKeys = new Set();

  for (const pr of pullRequests) {
    if (!pr?.number) continue;

    let resolved = pr;
    if (isWrapperPullRequest(pr, excludeLabels)) {
      const metadata = parseHotfixSyncMetadataComment(pr.body || "");
      const originPrNumber = metadata?.origin_pr || null;
      if (!originPrNumber) {
        continue;
      }

      resolved = await getPullRequestByNumber(owner, repo, originPrNumber);
      if (!resolved || isWrapperPullRequest(resolved, excludeLabels)) {
        continue;
      }
    }

    const mergeCommitSha = normalizeSha(resolved.merge_commit_sha || "");
    const dedupeKey = mergeCommitSha
      ? `sha:${mergeCommitSha}`
      : `pr:${resolved.number}`;
    if (seenKeys.has(dedupeKey)) continue;

    seenKeys.add(dedupeKey);
    resolvedPullRequests.set(resolved.number, resolved);
  }

  return [...resolvedPullRequests.values()];
}

function resolveLatestStableTag() {
  const raw = runGit(["tag", "--list", "v*", "--sort=-v:refname"]);
  if (!raw) return "";
  return (
    raw
      .split(/\r?\n/)
      .map((value) => value.trim())
      .find((value) => /^v\d+\.\d+\.\d+$/.test(value)) || ""
  );
}

function parseSemver(version) {
  const match = String(version || "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    throw new Error(
      `Unsupported stable version format: ${version || "(empty)"}`,
    );
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function bumpVersion(version, bump) {
  const parsed = parseSemver(version);
  if (bump === "major") return `${parsed.major + 1}.0.0`;
  if (bump === "minor") return `${parsed.major}.${parsed.minor + 1}.0`;
  if (bump === "patch")
    return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

function bumpRank(bump) {
  return RELEASE_BUMP_ORDER.indexOf(bump);
}

function formatChangelogSection({ version, releasePullRequests, categories }) {
  const grouped = new Map();
  for (const category of categories) grouped.set(category.title, []);
  grouped.set("Other Changes", []);

  for (const pr of releasePullRequests) {
    const labelSet = new Set((pr.labels || []).map((label) => label.name));
    let categoryTitle = categoryFromLabels(labelSet, categories);

    if (!categoryTitle) {
      const semanticLabel = semanticLabelFromTitle(pr.title || "");
      if (semanticLabel) {
        labelSet.add(semanticLabel);
        categoryTitle = categoryFromLabels(labelSet, categories);
      }
    }

    if (!categoryTitle) {
      categoryTitle = "Other Changes";
    }

    grouped.get(categoryTitle).push(pr);
  }

  const lines = [
    `## ${version}`,
    "",
    "The conductor just signed off on a new stable release.",
  ];

  for (const category of categories) {
    const entries = grouped.get(category.title) || [];
    if (entries.length === 0) continue;

    lines.push("", `### ${category.title}`, "");
    for (const pr of entries) {
      const title = normalizePrTitle(pr.title);
      const login = pr.user?.login || "unknown";
      lines.push(`- ${title} by @${login} in #${pr.number}`);
    }
  }

  const otherEntries = grouped.get("Other Changes") || [];
  if (otherEntries.length > 0) {
    lines.push("", "### Other Changes", "");
    for (const pr of otherEntries) {
      const title = normalizePrTitle(pr.title);
      const login = pr.user?.login || "unknown";
      lines.push(`- ${title} by @${login} in #${pr.number}`);
    }
  }

  return lines.join("\n");
}

function prependChangelogSection(section) {
  const existing = fs.existsSync(CHANGELOG_PATH)
    ? fs.readFileSync(CHANGELOG_PATH, "utf8").replace(/\r\n/g, "\n").trimEnd()
    : "# Changelog";

  if (existing === "# Changelog") {
    fs.writeFileSync(CHANGELOG_PATH, `# Changelog\n\n${section}\n`, "utf8");
    return;
  }

  if (!existing.startsWith("# Changelog")) {
    fs.writeFileSync(
      CHANGELOG_PATH,
      `# Changelog\n\n${section}\n\n${existing}\n`,
      "utf8",
    );
    return;
  }

  const remainder = existing.replace(/^# Changelog\s*/u, "").trimStart();
  const lines = ["# Changelog", "", section];
  if (remainder) {
    lines.push("", remainder);
  }

  fs.writeFileSync(CHANGELOG_PATH, `${lines.join("\n")}\n`, "utf8");
}

function updatePackageVersion(version) {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  pkg.version = version;
  fs.writeFileSync(
    PACKAGE_JSON_PATH,
    `${JSON.stringify(pkg, null, 4)}\n`,
    "utf8",
  );
}

function buildPullRequestBody({
  nextVersion,
  appliedBump,
  previousTag,
  releasePullRequests,
}) {
  const lines = [
    "Auto-generated stable release PR.",
    "",
    `- Version: \`v${nextVersion}\``,
    `- Applied bump: \`${appliedBump}\``,
    `- Previous stable tag: ${previousTag ? `\`${previousTag}\`` : "_none_"}`,
    "",
    "Included PRs:",
  ];

  for (const pr of releasePullRequests) {
    lines.push(`- #${pr.number} ${normalizePrTitle(pr.title)}`);
  }

  return lines.join("\n");
}

async function main() {
  const owner = readEnv("REPO_OWNER");
  const repo = readEnv("REPO_NAME");

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const currentVersion = String(pkg.version || "").trim();
  if (!currentVersion) {
    throw new Error("Project/package.json is missing `version`.");
  }

  const previousTag = resolveLatestStableTag();
  const range = previousTag ? `${previousTag}..main` : "main";
  const { categories, excludeLabels } = parseReleaseConfig();
  const pullRequests = await collectPullRequestsFromRange(owner, repo, range);
  const resolvedPullRequests = await resolveReleasePullRequests({
    owner,
    repo,
    pullRequests,
    excludeLabels,
  });

  const releasePullRequests = resolvedPullRequests
    .map((pr) => ({ pr, bump: extractReleaseBump(pr) }))
    .filter(({ pr, bump }) => {
      if (isWrapperPullRequest(pr, excludeLabels)) return false;
      if (bump === "none") return false;
      return true;
    })
    .sort((left, right) => {
      const leftDate =
        left.pr.merged_at || left.pr.updated_at || left.pr.created_at || "";
      const rightDate =
        right.pr.merged_at || right.pr.updated_at || right.pr.created_at || "";
      if (leftDate && rightDate && leftDate !== rightDate) {
        return leftDate.localeCompare(rightDate);
      }
      return left.pr.number - right.pr.number;
    });

  if (releasePullRequests.length === 0) {
    writeOutput("should_release", "false");
    return;
  }

  const appliedBump = releasePullRequests.reduce((top, entry) => {
    return bumpRank(entry.bump) > bumpRank(top) ? entry.bump : top;
  }, "none");

  const nextVersion = bumpVersion(currentVersion, appliedBump);
  const includedPullRequests = releasePullRequests.map((entry) => entry.pr);
  const changelogSection = formatChangelogSection({
    version: nextVersion,
    releasePullRequests: includedPullRequests,
    categories,
  });

  updatePackageVersion(nextVersion);
  prependChangelogSection(changelogSection);

  writeOutput("should_release", "true");
  writeOutput("version", nextVersion);
  writeOutput("previous_tag", previousTag);
  writeOutput("applied_bump", appliedBump);
  writeOutput(
    "pr_body",
    buildPullRequestBody({
      nextVersion,
      appliedBump,
      previousTag,
      releasePullRequests: includedPullRequests,
    }),
  );
}

if (
  (process.argv[1] || "")
    .replaceAll("\\", "/")
    .endsWith("/prepare-stable-release.mjs")
) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
