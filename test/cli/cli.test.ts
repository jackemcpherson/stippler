import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";
import { makePortrait } from "../helpers";

const runExec = promisify(execFile);

const REPO_ROOT = new URL("../..", import.meta.url).pathname;

async function cli(args: string[]) {
  try {
    const { stdout, stderr } = await runExec("bun", ["src/cli.ts", ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? "", stderr: e.stderr ?? "" };
  }
}

let portraitPath: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "stippler-cli-"));
  const portrait = await makePortrait();
  portraitPath = join(dir, "portrait.jpg");
  await writeFile(portraitPath, portrait);
});

describe("CLI subprocess", () => {
  it("happy path SVG: produces a valid SVG with correct viewBox", { timeout: 30_000 }, async () => {
    const outPath = join(dir, "out.svg");
    const result = await cli([portraitPath, "--no-cutout", "-o", outPath]);
    expect(result.code).toBe(0);
    const content = await readFile(outPath, "utf8");
    expect(content.startsWith("<svg ")).toBe(true);
    expect(content).toContain('viewBox="0 0 360 432"');
  });

  it("PNG output: produces a file with the PNG magic bytes", { timeout: 30_000 }, async () => {
    const outPath = join(dir, "out.png");
    const result = await cli([portraitPath, "--no-cutout", "-o", outPath, "--scale", "1"]);
    expect(result.code).toBe(0);
    const bytes = await readFile(outPath);
    // PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(bytes.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
  });

  it("invalid flag value --dots 1: exits 1 and mentions --dots", { timeout: 30_000 }, async () => {
    const result = await cli([portraitPath, "--no-cutout", "--dots", "1"]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("--dots");
  });

  it("missing input file: exits 1 and mentions 'could not read'", { timeout: 30_000 }, async () => {
    const result = await cli([join(dir, "nope.jpg"), "--no-cutout"]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("could not read");
  });

  it("bad output extension .gif: exits 1 and mentions .svg or .png", {
    timeout: 30_000,
  }, async () => {
    const result = await cli([portraitPath, "--no-cutout", "-o", "out.gif"]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain(".svg or .png");
  });

  it("invalid crop values: exits 1 and mentions crop", { timeout: 30_000 }, async () => {
    const result = await cli([portraitPath, "--no-cutout", "--crop", "0.9,0,0.1,1"]);
    expect(result.code).toBe(1);
    expect(result.stdout + result.stderr).toContain("crop");
  });

  it("determinism: two runs with --seed 7 produce byte-identical SVG output", {
    timeout: 30_000,
  }, async () => {
    const out1 = join(dir, "det1.svg");
    const out2 = join(dir, "det2.svg");
    const [r1, r2] = await Promise.all([
      cli([portraitPath, "--no-cutout", "--seed", "7", "-o", out1]),
      cli([portraitPath, "--no-cutout", "--seed", "7", "-o", out2]),
    ]);
    expect(r1.code).toBe(0);
    expect(r2.code).toBe(0);
    const [b1, b2] = await Promise.all([readFile(out1), readFile(out2)]);
    expect(b1.equals(b2)).toBe(true);
  });
});
