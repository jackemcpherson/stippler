#!/usr/bin/env node
import { intro, log, outro, spinner } from "@clack/prompts";
import { defineCommand, runMain } from "citty";
import pc from "picocolors";
import { parseFlags } from "./cli/flags";
import { writeOutput } from "./cli/output";
import { generateHedcut } from "./core/pipeline";
import { inputStem, resolveInput } from "./infra/input";
import { ensureModel } from "./infra/model-cache";
import { StipplerError } from "./lib/errors";

declare const PACKAGE_VERSION: string;

/** Exit with a red one-line message. */
function fail(error: StipplerError): never {
  log.error(pc.red(error.message));
  process.exit(1);
}

const main = defineCommand({
  meta: {
    name: "stippler",
    version: typeof PACKAGE_VERSION === "string" ? PACKAGE_VERSION : "dev",
    description: "WSJ-hedcut-style stipple portraits from photos, as compact SVGs",
  },
  args: {
    input: {
      type: "positional",
      description: "Image path or direct http(s) URL",
      required: true,
    },
    out: {
      type: "string",
      alias: "o",
      description: "Output path; .svg or .png decides the format (default <input>.svg)",
    },
    dots: { type: "string", description: "Number of stipple dots (default 2200)" },
    iters: { type: "string", description: "Lloyd relaxation iterations (default 45)" },
    gamma: { type: "string", description: "Darkness exponent (default 1.45)" },
    "edge-boost": { type: "string", description: "Edge contribution to density (default 0.4)" },
    seed: { type: "string", description: "PRNG seed for deterministic output (default 7)" },
    ink: { type: "string", description: "Dot colour as hex (default #1a1a1a)" },
    scale: { type: "string", description: "PNG scale factor over 360x432 (default 2)" },
    crop: { type: "string", description: "Fractional pre-crop x0,y0,x1,y1" },
    cutout: {
      type: "boolean",
      default: true,
      description: "U2Net background removal + head framing (--no-cutout to skip)",
    },
    "model-path": {
      type: "string",
      description: "Path to u2net.onnx (default: auto-download to ~/.cache/stippler)",
    },
  },
  async run({ args }) {
    intro(pc.bold("stippler"));

    const flags = parseFlags({
      dots: args.dots,
      iters: args.iters,
      gamma: args.gamma,
      edgeBoost: args["edge-boost"],
      seed: args.seed,
      ink: args.ink,
      scale: args.scale,
      cutout: args.cutout,
      crop: args.crop,
      modelPath: args["model-path"],
      out: args.out,
    });
    if (!flags.success) fail(flags.error);

    const s = spinner();
    s.start("Reading input");
    const image = await resolveInput(args.input);
    if (!image.success) {
      s.stop("Reading input failed");
      fail(image.error);
    }
    s.stop(`Read ${args.input}`);

    let modelPath: string | undefined;
    if (flags.data.cutout) {
      s.start("Resolving u2net model");
      const model = await ensureModel({
        ...(flags.data.modelPath !== undefined ? { modelPath: flags.data.modelPath } : {}),
        onProgress: (received, total) => {
          const mb = (received / 1e6).toFixed(0);
          const totalMb = total === null ? "?" : (total / 1e6).toFixed(0);
          s.message(`Downloading u2net.onnx (one-time): ${mb} / ${totalMb} MB`);
        },
      });
      if (!model.success) {
        s.stop("Model resolution failed");
        fail(model.error);
      }
      modelPath = model.data;
      s.stop("Model ready");
    }

    s.start(`Stippling (${flags.data.dots} dots, ${flags.data.iters} iterations)`);
    const result = await generateHedcut(image.data, {
      dots: flags.data.dots,
      iters: flags.data.iters,
      gamma: flags.data.gamma,
      edgeBoost: flags.data.edgeBoost,
      seed: flags.data.seed,
      ink: flags.data.ink,
      cutout: flags.data.cutout,
      ...(modelPath !== undefined ? { modelPath } : {}),
      ...(flags.data.crop !== undefined ? { crop: flags.data.crop } : {}),
    });
    if (!result.success) {
      s.stop("Stippling failed");
      fail(result.error);
    }
    s.stop(`Stippled ${result.data.dotCount} dots`);

    const written = await writeOutput(result.data.svg, {
      ...(flags.data.out !== undefined ? { out: flags.data.out } : {}),
      inputStem: inputStem(args.input),
      scale: flags.data.scale,
      width: result.data.width,
      height: result.data.height,
    });
    if (!written.success) fail(written.error);

    const kb = (Buffer.byteLength(result.data.svg) / 1024).toFixed(0);
    outro(pc.green(`${written.data} (${result.data.dotCount} dots, ${kb} KB svg)`));
  },
});

runMain(main).catch((error: unknown) => {
  if (error instanceof StipplerError) {
    console.error(pc.red(error.message));
  } else {
    console.error(pc.red(`unexpected error: ${error instanceof Error ? error.message : error}`));
  }
  process.exit(1);
});
