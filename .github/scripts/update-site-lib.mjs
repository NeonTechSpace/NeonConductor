import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

export const CHANNELS = ["stable", "beta", "alpha"];
const SITE_ROOT_PATH = "/NeonConductor/";

function resolveProjectPackageJson() {
  const candidates = [
    path.resolve(process.cwd(), "Project/package.json"),
    path.resolve(process.cwd(), "package.json"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to resolve Project/package.json for workflow script dependencies.",
  );
}

const projectRequire = createRequire(resolveProjectPackageJson());
const { parse, stringify } = projectRequire("yaml");

export function listMetadataFiles(inputDir) {
  const found = [];

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      if (entry.isFile() && /\.(ya?ml)$/i.test(entry.name)) {
        found.push(fullPath);
      }
    }
  }

  walk(inputDir);
  return found.sort((a, b) => a.localeCompare(b));
}

export function basenameFromReference(value) {
  const normalized = String(value).trim().replaceAll("\\", "/");
  if (!normalized) {
    return "";
  }

  if (/^https?:\/\//i.test(normalized)) {
    return path.posix.basename(new URL(normalized).pathname);
  }

  return path.posix.basename(normalized);
}

function transformManifestData(value, parentKey, transformReference) {
  if (Array.isArray(value)) {
    return value.map((item) =>
      transformManifestData(item, parentKey, transformReference),
    );
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        transformManifestData(child, key, transformReference),
      ]),
    );
  }

  if (
    (parentKey === "path" || parentKey === "url") &&
    typeof value === "string"
  ) {
    return transformReference(value);
  }

  return value;
}

export function rewriteManifestSource(source, transformReference) {
  const parsed = parse(source);
  const rewritten = transformManifestData(parsed, null, transformReference);
  return stringify(rewritten, { lineWidth: 0 });
}

function collectAssetNames(value, parentKey, output) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectAssetNames(item, parentKey, output);
    }
    return;
  }

  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      collectAssetNames(child, key, output);
    }
    return;
  }

  if (
    (parentKey === "path" || parentKey === "url") &&
    typeof value === "string"
  ) {
    const name = basenameFromReference(value);
    if (name) {
      output.add(name);
    }
  }
}

export function extractReferencedAssetNames(source) {
  const parsed = typeof source === "string" ? parse(source) : source;
  const referenced = new Set();
  collectAssetNames(parsed, null, referenced);
  return referenced;
}

export function makeReleaseAssetUrl(owner, repo, tagName, assetName) {
  return `https://github.com/${owner}/${repo}/releases/download/${encodeURIComponent(tagName)}/${encodeURIComponent(assetName)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getChannelTheme(channel) {
  if (channel === "stable") {
    return {
      tone: "Stable lane",
      description: "Signed releases for general use.",
      accent: "#8ad8ff",
    };
  }

  if (channel === "beta") {
    return {
      tone: "Preview lane",
      description: "Feature-complete builds for validation.",
      accent: "#91a7ff",
    };
  }

  return {
    tone: "Experimental lane",
    description: "Earliest drops for validation and rough edges.",
    accent: "#f0c891",
  };
}

function renderLaneRow(channelBaseHref) {
  return `<div class="lane-row">
    ${CHANNELS.map((channel) => {
      const theme = getChannelTheme(channel);
      return `<a class="lane-item" href="${channelBaseHref}${channel}/" style="--lane-accent:${theme.accent};">
        <span class="lane-eyebrow">${escapeHtml(theme.tone)}</span>
        <strong>${escapeHtml(capitalize(channel))}</strong>
        <span class="lane-copy">${escapeHtml(theme.description)}</span>
        <span class="lane-link">Open lane</span>
      </a>`;
    }).join("")}
  </div>`;
}

function renderMetadataMarkup({ channel, files, owner, repo }) {
  const theme = getChannelTheme(channel);

  if (files.length <= 1) {
    if (files.length === 0) {
      return `<section class="section-block">
        <p class="section-kicker">No published metadata</p>
        <h2 class="section-title">This lane has not shipped yet.</h2>
        <p class="section-copy">Once a release is published into ${escapeHtml(channel)}, this page will expose the feed files and direct release links.</p>
        <div class="actions">
          <a class="action-link secondary" href="${SITE_ROOT_PATH}">Back to update home</a>
          <a class="action-link" href="https://github.com/${owner}/${repo}/releases">Open releases</a>
        </div>
      </section>`;
    }

    const file = files[0];
    const tagName = file.version ? `v${file.version}` : null;
    return `<section class="section-block">
      <div class="list-item" style="--lane-accent:${theme.accent};">
        <div class="list-copy">
          <p class="section-kicker">${escapeHtml(channel)} feed file</p>
          <h2 class="section-title">${escapeHtml(file.name)}</h2>
          <p class="section-copy">${tagName ? `Published for ${escapeHtml(tagName)}.` : "Metadata file available on this lane."}</p>
        </div>
        <div class="actions">
          <a class="action-link" href="./${encodeURIComponent(file.name)}">Open metadata</a>
          ${
            tagName
              ? `<a class="action-link secondary" href="https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tagName)}">Open ${escapeHtml(tagName)}</a>`
              : ""
          }
        </div>
      </div>
    </section>`;
  }

  return `<section class="section-block">
    <div class="section-head">
      <div>
        <p class="section-kicker">Published metadata</p>
        <h2 class="section-title">Live files in the ${escapeHtml(channel)} lane</h2>
      </div>
      <p class="section-copy">Each entry below maps to a real updater metadata file published on this site.</p>
    </div>
    <div class="meta-grid">
      ${files
        .map((file) => {
          const tagName = file.version ? `v${file.version}` : null;
          return `<article class="meta-card" style="--lane-accent:${theme.accent};">
            <p class="section-kicker">${escapeHtml(channel)} feed file</p>
            <h3>${escapeHtml(file.name)}</h3>
            <p class="section-copy">${tagName ? `Published for ${escapeHtml(tagName)}.` : "Metadata file available on this lane."}</p>
            <div class="actions">
              <a class="action-link" href="./${encodeURIComponent(file.name)}">Open metadata</a>
              ${
                tagName
                  ? `<a class="action-link secondary" href="https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tagName)}">Open ${escapeHtml(tagName)}</a>`
                  : ""
              }
            </div>
          </article>`;
        })
        .join("")}
    </div>
  </section>`;
}

function renderDocument(title, description, body, options = {}) {
  const pageTag = options.pageTag || "Update feed";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    html { min-height: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: clamp(18px, 3vw, 28px);
      font-family: "Outfit", "Segoe UI", sans-serif;
      color: #eef4ff;
      background:
        radial-gradient(circle at 18% 18%, rgba(48, 102, 255, 0.22), transparent 24%),
        linear-gradient(180deg, #02050b 0%, #050914 54%, #07101d 100%);
      overflow-x: hidden;
    }
    body::before {
      content: "";
      position: fixed;
      inset: 0;
      pointer-events: none;
      opacity: 0.24;
      background:
        radial-gradient(circle at center, rgba(255, 255, 255, 0.12) 0 1px, transparent 1px) 0 0 / 180px 180px,
        radial-gradient(circle at center, rgba(143, 173, 255, 0.09) 0 1px, transparent 1px) 90px 90px / 220px 220px;
      mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.8), transparent);
    }
    main {
      position: relative;
      z-index: 1;
      width: min(980px, 100%);
      display: grid;
      gap: 14px;
      align-content: center;
    }
    .shell {
      border-radius: 28px;
      border: 1px solid rgba(150, 180, 255, 0.14);
      background: rgba(6, 12, 24, 0.88);
      box-shadow:
        0 28px 80px rgba(0, 0, 0, 0.42),
        inset 0 1px 0 rgba(255, 255, 255, 0.04);
      backdrop-filter: blur(18px);
    }
    .shell-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 20px 24px 0;
    }
    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.24em;
      text-transform: uppercase;
      color: rgba(220, 231, 255, 0.6);
    }
    .brand::before {
      content: "";
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: linear-gradient(135deg, #7aa7ff, #9ee7ff);
      box-shadow: 0 0 18px rgba(122, 167, 255, 0.55);
    }
    .page-tag {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid rgba(150, 180, 255, 0.14);
      background: rgba(255, 255, 255, 0.03);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: rgba(230, 238, 255, 0.68);
    }
    .hero {
      padding: 22px 24px 24px;
      display: grid;
      gap: 18px;
    }
    .hero-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.2fr) minmax(260px, 0.8fr);
      gap: 18px;
      align-items: start;
    }
    .hero-copy {
      display: grid;
      gap: 12px;
      align-content: start;
    }
    .eyebrow,
    .section-kicker {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.22em;
      text-transform: uppercase;
      color: rgba(186, 203, 245, 0.54);
    }
    h1 {
      margin: 0;
      max-width: 10ch;
      font-size: clamp(2rem, 4.9vw, 4rem);
      line-height: 0.94;
      letter-spacing: -0.05em;
      color: #f5f8ff;
    }
    .lead,
    .section-copy {
      margin: 0;
      line-height: 1.65;
      color: rgba(208, 220, 247, 0.72);
      font-size: 0.98rem;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .summary-rail {
      border-left: 1px solid rgba(150, 180, 255, 0.12);
      padding-left: 18px;
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .summary-label {
      margin: 0;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(186, 203, 245, 0.48);
    }
    .summary-title {
      margin: 0;
      font-size: 1.35rem;
      line-height: 1.1;
      color: #f3f7ff;
    }
    .section-block {
      border-top: 1px solid rgba(150, 180, 255, 0.12);
      padding-top: 18px;
      display: grid;
      gap: 14px;
    }
    .section-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 16px;
    }
    .section-title {
      margin: 4px 0 0;
      font-size: 1.28rem;
      line-height: 1.15;
      color: #f5f8ff;
    }
    .lane-row {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
      padding-top: 6px;
    }
    .lane-item {
      position: relative;
      display: grid;
      gap: 7px;
      padding-left: 16px;
      text-decoration: none;
      color: inherit;
    }
    .lane-item::before {
      content: "";
      position: absolute;
      left: 0;
      top: 1px;
      bottom: 1px;
      width: 2px;
      border-radius: 999px;
      background: var(--lane-accent, #8ad8ff);
    }
    .lane-item strong {
      font-size: 1rem;
      color: #f3f7ff;
    }
    .lane-eyebrow {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: rgba(186, 203, 245, 0.5);
    }
    .lane-copy {
      line-height: 1.55;
      color: rgba(205, 220, 250, 0.68);
    }
    .lane-link {
      margin-top: 2px;
      font-weight: 600;
      color: var(--lane-accent, #8ad8ff);
    }
    .list-item {
      border-left: 2px solid var(--lane-accent, #8ad8ff);
      padding-left: 16px;
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 16px;
    }
    .list-copy {
      display: grid;
      gap: 8px;
    }
    .meta-grid {
      display: grid;
      gap: 12px;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    }
    .meta-card {
      border-left: 2px solid var(--lane-accent, #8ad8ff);
      padding: 0 0 0 14px;
      display: grid;
      gap: 10px;
    }
    .meta-card h3 {
      margin: 0;
      font-size: 1rem;
      line-height: 1.25;
      color: #f4f8ff;
    }
    .action-link {
      min-height: 40px;
      padding: 0 16px;
      border-radius: 999px;
      border: 1px solid rgba(150, 180, 255, 0.16);
      background: rgba(255, 255, 255, 0.03);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #eef4ff;
      text-decoration: none;
      font-weight: 500;
      transition: border-color 160ms ease, background 160ms ease, transform 160ms ease;
    }
    .action-link:hover {
      transform: translateY(-1px);
      border-color: rgba(182, 203, 255, 0.28);
      background: rgba(255, 255, 255, 0.05);
    }
    .action-link.secondary {
      color: #9fd7ff;
    }
    .shell-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 0 6px;
      font-size: 0.88rem;
      color: rgba(181, 198, 232, 0.52);
    }
    .shell-footer a {
      color: rgba(202, 218, 252, 0.76);
      text-decoration: none;
    }
    .shell-footer a:hover {
      color: #f2f7ff;
    }
    @media (max-width: 860px) {
      body {
        display: block;
      }
      main {
        width: 100%;
      }
      .hero-grid {
        grid-template-columns: 1fr;
      }
      .summary-rail {
        border-left: 0;
        border-top: 1px solid rgba(150, 180, 255, 0.12);
        padding-left: 0;
        padding-top: 14px;
      }
      .lane-row {
        grid-template-columns: 1fr;
      }
      .section-head,
      .list-item,
      .shell-footer,
      .shell-header {
        flex-direction: column;
        align-items: start;
      }
    }
    @media (max-width: 640px) {
      .hero {
        padding: 18px 18px 20px;
      }
      .shell-header {
        padding: 18px 18px 0;
      }
      h1 {
        max-width: none;
      }
    }
  </style>
</head>
<body>
  <main>
    <section class="shell">
      <header class="shell-header">
        <div class="brand">NeonConductor</div>
        <div class="page-tag">${escapeHtml(pageTag)}</div>
      </header>
      ${body}
    </section>
    <footer class="shell-footer">
      <span>${escapeHtml(description)}</span>
      <a href="https://github.com/Neonsy/NeonConductor/releases">View GitHub Releases</a>
    </footer>
  </main>
</body>
</html>`;
}

function createUpdatesRedirectHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="0; url=${SITE_ROOT_PATH}">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redirecting…</title>
  <script>window.location.replace(${JSON.stringify(SITE_ROOT_PATH)});</script>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: "Outfit", "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #02050b 0%, #050914 54%, #07101d 100%);
      color: #eef4ff;
    }
    main {
      max-width: 520px;
      text-align: center;
    }
    h1 {
      margin: 0 0 12px;
      font-size: clamp(1.5rem, 3vw, 2rem);
      letter-spacing: -0.03em;
    }
    p {
      margin: 0;
      line-height: 1.6;
      color: rgba(208, 220, 247, 0.72);
    }
    a {
      color: #9fd7ff;
    }
  </style>
</head>
<body>
  <main>
    <h1>Redirecting to update home…</h1>
    <p>If the redirect does not happen automatically, <a href="${SITE_ROOT_PATH}">open the root page</a>.</p>
  </main>
</body>
</html>`;
}

function readChannelMetadata(siteDir, channel) {
  const channelDir = path.join(siteDir, "updates", channel);
  if (!fs.existsSync(channelDir)) {
    return [];
  }

  return fs
    .readdirSync(channelDir)
    .filter((name) => /\.(ya?ml)$/i.test(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const fullPath = path.join(channelDir, name);
      const parsed = parse(fs.readFileSync(fullPath, "utf8"));
      return {
        name,
        version: parsed?.version ?? null,
      };
    });
}

export function createRootIndexHtml({ owner, repo }) {
  const body = `<section class="hero">
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">Update shell</p>
        <h1>Three lanes, one release map.</h1>
        <p class="lead">This Pages surface publishes the metadata files the desktop app reads before handing binary downloads off to GitHub Releases.</p>
        <div class="actions">
          <a class="action-link" href="./updates/stable/">Open stable lane</a>
          <a class="action-link secondary" href="https://github.com/${owner}/${repo}/releases">Open release archive</a>
        </div>
      </div>
      <aside class="summary-rail">
        <p class="summary-label">Surface behavior</p>
        <h2 class="summary-title">Readable outside, machine-consumed inside.</h2>
        <p class="section-copy">The site stays human-friendly, but the contract mirrors the real updater feed and release flow.</p>
      </aside>
    </div>
    <section class="section-block">
      <div class="section-head">
        <div>
          <p class="section-kicker">Channel selection</p>
          <h2 class="section-title">Open a live feed lane</h2>
        </div>
        <p class="section-copy">Stable for signed releases, beta for previews, alpha for earliest drops.</p>
      </div>
      ${renderLaneRow("./updates/")}
    </section>
  </section>`;

  return renderDocument(
    "NeonConductor update shell",
    "GitHub Pages updater feed",
    body,
    {
      pageTag: "Home",
    },
  );
}

export function createChannelIndexHtml({ channel, files, owner, repo }) {
  const theme = getChannelTheme(channel);
  const body = `<section class="hero">
    <div class="hero-grid">
      <div class="hero-copy">
        <p class="eyebrow">${escapeHtml(theme.tone)}</p>
        <h1>${escapeHtml(capitalize(channel))} feed index.</h1>
        <p class="lead">${escapeHtml(theme.description)} This page exposes the published metadata files for this lane before downloads continue on GitHub Releases.</p>
        <div class="actions">
          <a class="action-link" href="${SITE_ROOT_PATH}">Back to update home</a>
          <a class="action-link secondary" href="https://github.com/${owner}/${repo}/releases">Open release archive</a>
        </div>
      </div>
      <aside class="summary-rail">
        <p class="summary-label">Lane contract</p>
        <h2 class="summary-title">Metadata here, installers in Releases.</h2>
        <p class="section-copy">The feed stays inspectable without turning the whole page into a grid of decorative surfaces.</p>
      </aside>
    </div>
    ${renderMetadataMarkup({ channel, files, owner, repo })}
  </section>`;

  return renderDocument(
    `${capitalize(channel)} update channel`,
    "NeonConductor updates",
    body,
    {
      pageTag: `${capitalize(channel)} lane`,
    },
  );
}

export function createNotFoundHtml() {
  const body = `<section class="hero">
    <div class="hero-copy">
      <p class="eyebrow">404</p>
      <h1>That route is outside the published feed.</h1>
      <p class="lead">This site only exposes the update home, channel indexes, and the metadata files that the updater can consume.</p>
      <div class="actions">
        <a class="action-link" href="${SITE_ROOT_PATH}">Open update home</a>
        <a class="action-link secondary" href="${SITE_ROOT_PATH}updates/stable/">Open stable lane</a>
      </div>
    </div>
  </section>`;

  return renderDocument("Page not found", "NeonConductor updates", body, {
    pageTag: "404",
  });
}

export function writeSitePages(siteDir, owner, repo) {
  fs.mkdirSync(path.join(siteDir, "updates"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, ".nojekyll"), "\n", "utf8");
  fs.writeFileSync(
    path.join(siteDir, "index.html"),
    createRootIndexHtml({ owner, repo }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(siteDir, "updates", "index.html"),
    createUpdatesRedirectHtml(),
    "utf8",
  );
  fs.writeFileSync(
    path.join(siteDir, "404.html"),
    createNotFoundHtml(),
    "utf8",
  );

  for (const channel of CHANNELS) {
    const channelDir = path.join(siteDir, "updates", channel);
    fs.mkdirSync(channelDir, { recursive: true });
    const files = readChannelMetadata(siteDir, channel);
    fs.writeFileSync(
      path.join(channelDir, "index.html"),
      createChannelIndexHtml({ channel, files, owner, repo }),
      "utf8",
    );
  }
}
