import { describe, expect, it } from "vitest";
import { renderSvg } from "../../src/core/svg";

const HEADER = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 432" role="img">';

describe("renderSvg", () => {
  const points = Float64Array.of(10, 20, 100, 200, 250.55, 300.44, 359, 431);
  const darkness = Float64Array.of(0.1, 0.4, 0.7, 1.0);

  it("starts with the exact viewBox header and closes", () => {
    const svg = renderSvg(points, darkness, "#1a1a1a", 360, 432);
    expect(svg.startsWith(HEADER)).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("emits one M command per dot across at most 6 paths", () => {
    const svg = renderSvg(points, darkness, "#1a1a1a", 360, 432);
    expect(svg.match(/M/g)?.length).toBe(4);
    expect(svg.match(/<path /g)?.length).toBeLessThanOrEqual(6);
  });

  it("keeps stroke widths in the theoretical range, increasing by bucket", () => {
    const svg = renderSvg(points, darkness, "#1a1a1a", 360, 432);
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(widths.length).toBeGreaterThan(0);
    for (const w of widths) {
      expect(w).toBeGreaterThanOrEqual(1.0);
      expect(w).toBeLessThanOrEqual(4.1);
    }
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeGreaterThan(widths[i - 1] ?? 0);
    }
  });

  it("stamps the ink colour on every path", () => {
    const svg = renderSvg(points, darkness, "#336699", 360, 432);
    const paths = svg.match(/<path /g)?.length ?? 0;
    expect(svg.match(/stroke="#336699"/g)?.length).toBe(paths);
  });

  it("collapses uniform darkness into a single path with no NaN", () => {
    const svg = renderSvg(points, Float64Array.of(0.5, 0.5, 0.5, 0.5), "#1a1a1a", 360, 432);
    expect(svg.match(/<path /g)?.length).toBe(1);
    expect(svg).not.toContain("NaN");
  });

  it("formats coordinates to one decimal place", () => {
    const svg = renderSvg(points, darkness, "#1a1a1a", 360, 432);
    expect(svg).toContain("M250.6 300.4h.01");
  });

  it("keeps all dot coordinates inside the 360x432 viewBox and emits no NaN", () => {
    const svg = renderSvg(points, darkness, "#1a1a1a", 360, 432);
    const matches = [...svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)/g)];
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      const x = Number(m[1]);
      const y = Number(m[2]);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(360);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(432);
    }
    expect(svg).not.toContain("NaN");
  });
});
