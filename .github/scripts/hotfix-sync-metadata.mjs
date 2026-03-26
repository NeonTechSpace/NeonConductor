export const HOTFIX_SYNC_METADATA_MARKER = "hotfix-sync-metadata";
const RELEASE_BUMP_VALUES = new Set(["none", "patch", "minor", "major"]);

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeNumber(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value.trim());
  }

  return null;
}

function normalizeReleaseBump(value) {
  const normalized = normalizeString(value).toLowerCase();
  return RELEASE_BUMP_VALUES.has(normalized) ? normalized : "none";
}

export function normalizeHotfixSyncMetadata(value) {
  if (!value || typeof value !== "object") {
    throw new Error("Hotfix sync metadata must be an object.");
  }

  const originPr = normalizeNumber(value.origin_pr);
  if (!originPr) {
    throw new Error("Hotfix sync metadata is missing a valid origin_pr.");
  }

  const originBase = normalizeString(value.origin_base);
  const originHead = normalizeString(value.origin_head);
  const originMergeSha = normalizeString(value.origin_merge_sha);
  const carriedLabels = normalizeStringArray(value.carried_labels);
  const releaseBump = normalizeReleaseBump(value.release_bump);

  if (!originBase || !originHead || !originMergeSha) {
    throw new Error(
      "Hotfix sync metadata is missing origin_base, origin_head, or origin_merge_sha.",
    );
  }

  return {
    origin_pr: originPr,
    origin_base: originBase,
    origin_head: originHead,
    origin_merge_sha: originMergeSha,
    release_bump: releaseBump,
    carried_labels: carriedLabels,
  };
}

export function buildHotfixSyncMetadataComment(value) {
  const normalized = normalizeHotfixSyncMetadata(value);
  return `<!-- ${HOTFIX_SYNC_METADATA_MARKER}\n${JSON.stringify(normalized, null, 2)}\n-->`;
}

export function parseHotfixSyncMetadataComment(body) {
  const source = typeof body === "string" ? body : "";
  const markerPattern = new RegExp(
    `<!--\\s*${HOTFIX_SYNC_METADATA_MARKER}\\s*\\n([\\s\\S]*?)\\n-->`,
    "m",
  );
  const match = source.match(markerPattern);
  if (!match) return null;

  try {
    return normalizeHotfixSyncMetadata(JSON.parse(match[1]));
  } catch {
    return null;
  }
}
