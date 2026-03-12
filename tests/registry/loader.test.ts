import { describe, it, expect, beforeEach } from "vitest";
import {
  loadVenueProfiles,
  loadReviewProfiles,
  getVenueProfile,
  getReviewProfile,
  clearCaches,
} from "../../src/registry/loader.js";
import { VenueNotFoundError, ProfileNotFoundError } from "../../src/shared/errors/index.js";

describe("loadVenueProfiles", () => {
  beforeEach(() => clearCaches());

  it("loads all expected venue files from templates/venues/", () => {
    const map = loadVenueProfiles();
    expect(map.size).toBeGreaterThanOrEqual(4);
  });

  it("includes arxiv venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("arxiv")).toBe(true);
  });

  it("includes ieee venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("ieee")).toBe(true);
  });

  it("includes acm venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("acm")).toBe(true);
  });

  it("includes neurips venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("neurips")).toBe(true);
  });

  it("includes icml venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("icml")).toBe(true);
  });

  it("includes nature venue", () => {
    const map = loadVenueProfiles();
    expect(map.has("nature")).toBe(true);
  });

  it("each venue has id, name, criteria, and rejection_patterns", () => {
    const map = loadVenueProfiles();
    for (const [, venue] of map) {
      expect(venue.id).toBeTruthy();
      expect(venue.name).toBeTruthy();
      expect(Array.isArray(venue.criteria)).toBe(true);
      expect(venue.criteria.length).toBeGreaterThan(0);
      expect(Array.isArray(venue.rejection_patterns)).toBe(true);
    }
  });

  it("returns same map instance on second call (cache hit)", () => {
    const first = loadVenueProfiles();
    const second = loadVenueProfiles();
    expect(first).toBe(second);
  });

  it("repopulates contents after clearCaches()", () => {
    const first = loadVenueProfiles();
    expect(first.has("arxiv")).toBe(true);
    clearCaches();
    const second = loadVenueProfiles();
    // Both should have arxiv after loading
    expect(second.has("arxiv")).toBe(true);
    expect(second.size).toBe(first.size);
  });
});

describe("loadReviewProfiles", () => {
  beforeEach(() => clearCaches());

  it("loads all expected review profile files from templates/review-profiles/", () => {
    const map = loadReviewProfiles();
    expect(map.size).toBeGreaterThanOrEqual(4);
  });

  it("includes logical profile", () => {
    const map = loadReviewProfiles();
    expect(map.has("logical")).toBe(true);
  });

  it("includes rhetorical profile", () => {
    const map = loadReviewProfiles();
    expect(map.has("rhetorical")).toBe(true);
  });

  it("includes structural profile", () => {
    const map = loadReviewProfiles();
    expect(map.has("structural")).toBe(true);
  });

  it("includes style profile", () => {
    const map = loadReviewProfiles();
    expect(map.has("style")).toBe(true);
  });

  it("each profile has id, name, and dimensions array", () => {
    const map = loadReviewProfiles();
    for (const [, profile] of map) {
      expect(profile.id).toBeTruthy();
      expect(profile.name).toBeTruthy();
      expect(Array.isArray(profile.dimensions)).toBe(true);
      expect(profile.dimensions.length).toBeGreaterThan(0);
    }
  });

  it("each dimension has id, title, description, prompts, and severity_guide", () => {
    const map = loadReviewProfiles();
    for (const [, profile] of map) {
      for (const dim of profile.dimensions) {
        expect(dim.id).toBeTruthy();
        expect(dim.title).toBeTruthy();
        expect(Array.isArray(dim.prompts)).toBe(true);
        expect(dim.prompts.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getVenueProfile", () => {
  beforeEach(() => clearCaches());

  it("returns the arxiv venue profile", () => {
    const venue = getVenueProfile("arxiv");
    expect(venue.id).toBe("arxiv");
  });

  it("returns the nature venue profile", () => {
    const venue = getVenueProfile("nature");
    expect(venue.id).toBe("nature");
  });

  it("throws VenueNotFoundError for unknown venue id", () => {
    expect(() => getVenueProfile("nonexistent-venue" as any)).toThrow(VenueNotFoundError);
  });
});

describe("getReviewProfile", () => {
  beforeEach(() => clearCaches());

  it("returns the logical review profile", () => {
    const profile = getReviewProfile("logical");
    expect(profile.id).toBe("logical");
  });

  it("returns the structural review profile", () => {
    const profile = getReviewProfile("structural");
    expect(profile.id).toBe("structural");
  });

  it("throws ProfileNotFoundError for unknown profile id", () => {
    expect(() => getReviewProfile("nonexistent-profile" as any)).toThrow(ProfileNotFoundError);
  });
});
