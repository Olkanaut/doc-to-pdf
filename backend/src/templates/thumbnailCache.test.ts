import { describe, expect, it } from "vitest";
import {
  templateThumbnailCacheFileName,
  THUMBNAIL_CACHE_VERSION,
} from "./thumbnailCache.js";
import { THUMBNAIL_PPI } from "../compile/typstCompile.js";

describe("templateThumbnailCacheFileName", () => {
  it("produit un nom de fichier stable et safe", () => {
    const name = templateThumbnailCacheFileName(
      "template/id with spaces",
      "2026-09-17T12:00:00.000Z",
    );

    expect(name).toMatch(/^template_id_with_spaces-[0-9a-f]{16}\.png$/);
    expect(name).not.toContain("/");
  });

  it("change quand la version logique du thumbnail change", () => {
    const first = templateThumbnailCacheFileName(
      "template-id",
      "2026-09-17T12:00:00.000Z",
    );
    const second = templateThumbnailCacheFileName(
      "template-id",
      "2026-09-17T12:01:00.000Z",
    );

    expect(first).not.toBe(second);
    expect(THUMBNAIL_CACHE_VERSION).toBe("v2");
    expect(THUMBNAIL_PPI).toBe(120);
  });
});
