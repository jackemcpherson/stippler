import { defineConfig } from "bunup";

export default defineConfig({
  entry: ["src/index.ts"],
  dtsOnly: true,
  dts: {
    inferTypes: true,
  },
});
