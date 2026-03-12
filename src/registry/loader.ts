/**
 * Template loader for venue profiles and review profiles.
 * Reads YAML files from the templates/ directory and caches them in memory.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import type { VenueProfile, ReviewProfile, VenueId, ReviewProfileId } from "../shared/types.js";
import { TemplateLoadError, VenueNotFoundError, ProfileNotFoundError } from "../shared/errors/index.js";
import { logger } from "../shared/logger/index.js";

const MODULE = "registry/loader";

// Resolve templates directory relative to this file (works in both src/ and dist/).
const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../templates");

/** Cache to avoid repeated disk reads. */
const venueCache = new Map<string, VenueProfile>();
const profileCache = new Map<string, ReviewProfile>();

/**
 * Loads a single YAML file and returns its parsed content.
 *
 * @param filePath - Absolute path to the YAML file.
 * @returns Parsed YAML content as unknown (caller must validate shape).
 * @throws {TemplateLoadError} If the file cannot be read or parsed.
 */
function loadYaml(filePath: string): unknown {
  try {
    const raw = readFileSync(filePath, "utf-8");
    return yaml.load(raw);
  } catch (err) {
    throw new TemplateLoadError(filePath, String(err));
  }
}

/**
 * Loads all venue profiles from templates/venues/.
 * Results are cached after the first call.
 *
 * @returns Map of venueId → VenueProfile.
 */
export function loadVenueProfiles(): ReadonlyMap<string, VenueProfile> {
  if (venueCache.size > 0) return venueCache;

  const venuesDir = join(TEMPLATES_DIR, "venues");
  if (!existsSync(venuesDir)) {
    logger.warn(MODULE, "Venues directory not found", { venuesDir });
    return venueCache;
  }

  const files = readdirSync(venuesDir).filter((f) => f.endsWith(".yaml"));
  for (const file of files) {
    const filePath = join(venuesDir, file);
    const data = loadYaml(filePath) as VenueProfile;
    venueCache.set(data.id, data);
  }

  logger.info(MODULE, "Venue profiles loaded", { count: venueCache.size });
  return venueCache;
}

/**
 * Loads all review profiles from templates/review-profiles/.
 * Results are cached after the first call.
 *
 * @returns Map of profileId → ReviewProfile.
 */
export function loadReviewProfiles(): ReadonlyMap<string, ReviewProfile> {
  if (profileCache.size > 0) return profileCache;

  const profilesDir = join(TEMPLATES_DIR, "review-profiles");
  if (!existsSync(profilesDir)) {
    logger.warn(MODULE, "Review-profiles directory not found", { profilesDir });
    return profileCache;
  }

  const files = readdirSync(profilesDir).filter((f) => f.endsWith(".yaml"));
  for (const file of files) {
    const filePath = join(profilesDir, file);
    const data = loadYaml(filePath) as ReviewProfile;
    profileCache.set(data.id, data);
  }

  logger.info(MODULE, "Review profiles loaded", { count: profileCache.size });
  return profileCache;
}

/**
 * Returns a single venue profile by ID.
 *
 * @param id - The venue ID (e.g. "arxiv", "ieee").
 * @returns The matching VenueProfile.
 * @throws {VenueNotFoundError} If no profile matches the ID.
 */
export function getVenueProfile(id: VenueId | string): VenueProfile {
  const profiles = loadVenueProfiles();
  const profile = profiles.get(id);
  if (!profile) throw new VenueNotFoundError(id);
  return profile;
}

/**
 * Returns a single review profile by ID.
 *
 * @param id - The profile ID (e.g. "logical", "rhetorical").
 * @returns The matching ReviewProfile.
 * @throws {ProfileNotFoundError} If no profile matches the ID.
 */
export function getReviewProfile(id: ReviewProfileId | string): ReviewProfile {
  const profiles = loadReviewProfiles();
  const profile = profiles.get(id);
  if (!profile) throw new ProfileNotFoundError(id);
  return profile;
}

/** Clears all caches. Used in tests to force fresh loads from the filesystem. */
export function clearCaches(): void {
  venueCache.clear();
  profileCache.clear();
}
