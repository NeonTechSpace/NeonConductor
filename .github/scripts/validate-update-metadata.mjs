import fs from "node:fs";
import path from "node:path";

import {
  extractReferencedAssetNames,
  listMetadataFiles,
} from "./update-site-lib.mjs";

const REQUIRED_ENV = ["RELEASE_ID", "TAG_NAME", "REPO_OWNER", "REPO_NAME"];

function readEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function fetchReleaseAssets(owner, repo, releaseId, token) {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/releases/${encodeURIComponent(releaseId)}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch release ${releaseId}: ${response.status} ${response.statusText}`,
    );
  }

  const release = await response.json();
  return new Set((release.assets || []).map((asset) => asset.name));
}

function formatMissing(fileName, missingNames) {
  return `${fileName}: ${missingNames.join(", ")}`;
}

async function main() {
  for (const name of REQUIRED_ENV) {
    readEnv(name);
  }

  const owner = readEnv("REPO_OWNER");
  const repo = readEnv("REPO_NAME");
  const releaseId = readEnv("RELEASE_ID");
  const tagName = readEnv("TAG_NAME");
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const inputDir = path.resolve(process.env.INPUT_DIR || "dist-assets");

  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  const metadataFiles = listMetadataFiles(inputDir);
  if (metadataFiles.length === 0) {
    throw new Error(`No updater metadata files found in ${inputDir}.`);
  }

  const uploadedAssetNames = await fetchReleaseAssets(
    owner,
    repo,
    releaseId,
    token,
  );
  const missing = [];

  for (const filePath of metadataFiles) {
    const referenced = Array.from(
      extractReferencedAssetNames(fs.readFileSync(filePath, "utf8")),
    ).filter((name) => !uploadedAssetNames.has(name));
    if (referenced.length > 0) {
      missing.push(formatMissing(path.basename(filePath), referenced));
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Updater metadata references missing release assets for ${tagName}:\n${missing.join("\n")}`,
    );
  }

  console.log(
    `Validated updater metadata against uploaded release assets for ${tagName}.`,
  );
}

await main();
