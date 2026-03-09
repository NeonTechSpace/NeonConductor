import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import {
  basenameFromReference,
  CHANNELS,
  listMetadataFiles,
  makeReleaseAssetUrl,
  rewriteManifestSource,
  writeSitePages,
} from "./update-site-lib.mjs";

const REQUIRED_ENV = [
  "CHANNEL",
  "TAG_NAME",
  "REPO_OWNER",
  "REPO_NAME",
  "PAGES_BOT_NAME",
  "PAGES_BOT_EMAIL",
];

function readEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function runGit(args, cwd) {
  execFileSync("git", args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
}

function configureGitIdentity(repoDir, botName, botEmail) {
  runGit(["config", "user.name", botName], repoDir);
  runGit(["config", "user.email", botEmail], repoDir);
}

function ensurePagesRepo(repoDir, remoteUrl, branch, botName, botEmail) {
  try {
    runGit(
      ["clone", "--depth", "1", "--branch", branch, remoteUrl, repoDir],
      process.cwd(),
    );
  } catch {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(["init"], repoDir);
    runGit(["checkout", "-b", branch], repoDir);
    runGit(["remote", "add", "origin", remoteUrl], repoDir);
  }

  configureGitIdentity(repoDir, botName, botEmail);
}

function rewriteManifestFile(sourcePath, owner, repo, tagName) {
  const source = fs.readFileSync(sourcePath, "utf8");
  return rewriteManifestSource(source, (value) => {
    const assetName = basenameFromReference(value);
    if (!assetName) {
      return value;
    }

    return makeReleaseAssetUrl(owner, repo, tagName, assetName);
  });
}

function writeChannelFiles(
  siteDir,
  channel,
  metadataFiles,
  owner,
  repo,
  tagName,
) {
  const channelDir = path.join(siteDir, "updates", channel);
  fs.rmSync(channelDir, { recursive: true, force: true });
  fs.mkdirSync(channelDir, { recursive: true });

  const seenNames = new Set();
  for (const filePath of metadataFiles) {
    const filename = path.basename(filePath);
    if (seenNames.has(filename)) {
      throw new Error(`Duplicate metadata filename detected: ${filename}`);
    }

    seenNames.add(filename);
    fs.writeFileSync(
      path.join(channelDir, filename),
      rewriteManifestFile(filePath, owner, repo, tagName),
      "utf8",
    );
  }
}

function hasChanges(repoDir) {
  const status = execFileSync("git", ["status", "--short"], {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  return status.length > 0;
}

function main() {
  for (const name of REQUIRED_ENV) {
    readEnv(name);
  }

  const channel = readEnv("CHANNEL");
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Unsupported channel: ${channel}`);
  }

  const tagName = readEnv("TAG_NAME");
  const owner = readEnv("REPO_OWNER");
  const repo = readEnv("REPO_NAME");
  const botName = readEnv("PAGES_BOT_NAME");
  const botEmail = readEnv("PAGES_BOT_EMAIL");
  const token = (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
  const inputDir = path.resolve(process.env.INPUT_DIR || "dist-assets");
  const branch = (process.env.PAGES_BRANCH || "gh-pages").trim();

  if (!token) {
    throw new Error("Missing GITHUB_TOKEN/GH_TOKEN for Pages publish.");
  }
  if (!fs.existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }

  const metadataFiles = listMetadataFiles(inputDir);
  if (metadataFiles.length === 0) {
    throw new Error(`No updater metadata files found in ${inputDir}.`);
  }

  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "neonconductor-pages-"),
  );
  const siteDir = path.join(tempRoot, "site");
  const remoteUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;

  ensurePagesRepo(siteDir, remoteUrl, branch, botName, botEmail);
  writeChannelFiles(siteDir, channel, metadataFiles, owner, repo, tagName);
  writeSitePages(siteDir, owner, repo);

  runGit(["add", "."], siteDir);
  if (!hasChanges(siteDir)) {
    console.log(`No Pages changes detected for ${channel} ${tagName}.`);
    return;
  }

  runGit(
    ["commit", "-m", `docs(updates): publish ${channel} feed for ${tagName}`],
    siteDir,
  );
  runGit(["push", "origin", branch], siteDir);
  console.log(`Published ${channel} updater feed for ${tagName} to ${branch}.`);
}

main();
