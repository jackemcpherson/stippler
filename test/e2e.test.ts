import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { generateHedcut } from "../src/index";

/**
 * Synthetic "portrait": dark ellipse head and trapezoid shoulders on white.
 * Generated at test time so no binary fixture lives in git.
 */
async function makePortrait(): Promise<Buffer> {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="720">',
    '<rect width="600" height="720" fill="#ffffff"/>',
    '<ellipse cx="300" cy="260" rx="140" ry="180" fill="#3a3a3a"/>',
    '<ellipse cx="255" cy="230" rx="18" ry="10" fill="#0a0a0a"/>',
    '<ellipse cx="345" cy="230" rx="18" ry="10" fill="#0a0a0a"/>',
    '<polygon points="140,720 300,470 460,720" fill="#555555"/>',
    "</svg>",
  ].join("");
  return sharp(Buffer.from(svg)).jpeg({ quality: 92 }).toBuffer();
}

let portrait: Buffer;

beforeAll(async () => {
  portrait = await makePortrait();
});

describe("generateHedcut (no cutout)", () => {
  it("produces a valid, deterministic SVG with a plausible dot count", async () => {
    const a = await generateHedcut(portrait, { cutout: false, seed: 7 });
    const b = await generateHedcut(portrait, { cutout: false, seed: 7 });
    expect(a.success).toBe(true);
    expect(b.success).toBe(true);
    if (!a.success || !b.success) return;

    expect(
      a.data.svg.startsWith(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 432" role="img">',
      ),
    ).toBe(true);
    expect(a.data.svg.endsWith("</svg>")).toBe(true);
    // The synthetic fixture carries less dark mass than a real portrait, so
    // the darkness threshold prunes more of the 2200 requested dots.
    expect(a.data.dotCount).toBeGreaterThanOrEqual(600);
    expect(a.data.dotCount).toBeLessThanOrEqual(2200);
    expect(a.data.svg.match(/M/g)?.length).toBe(a.data.dotCount);
    expect(a.data.svg).toBe(b.data.svg);
  });

  it("changes with the seed", async () => {
    const a = await generateHedcut(portrait, { cutout: false, seed: 7 });
    const b = await generateHedcut(portrait, { cutout: false, seed: 8 });
    if (!a.success || !b.success) throw new Error("expected success");
    expect(a.data.svg).not.toBe(b.data.svg);
  });

  it("responds to gamma (higher gamma thins mid-tones)", async () => {
    const low = await generateHedcut(portrait, { cutout: false, gamma: 1, iters: 10 });
    const high = await generateHedcut(portrait, { cutout: false, gamma: 3, iters: 10 });
    if (!low.success || !high.success) throw new Error("expected success");
    expect(high.data.dotCount).toBeLessThanOrEqual(low.data.dotCount);
  });

  it("fails with MODEL_NOT_FOUND when cutout is enabled without a model path", async () => {
    const result = await generateHedcut(portrait, {});
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("MODEL_NOT_FOUND");
  });

  it("fails with UNSUPPORTED_IMAGE on garbage input", async () => {
    const result = await generateHedcut(Buffer.from("garbage"), { cutout: false });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNSUPPORTED_IMAGE");
  });
});

describe.skipIf(!process.env.STIPPLER_MODEL_PATH)("generateHedcut (u2net cutout)", () => {
  it("runs the full pipeline on the synthetic portrait", async () => {
    const result = await generateHedcut(portrait, {
      modelPath: process.env.STIPPLER_MODEL_PATH ?? "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dotCount).toBeGreaterThan(500);
      expect(result.data.svg).toContain("<path ");
    }
  }, 120_000);
});
