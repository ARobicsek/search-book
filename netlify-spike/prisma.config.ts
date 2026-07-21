import { defineConfig } from "prisma/config";

// KEY DIFFERENCE vs. the app's server/prisma.config.ts (which uses engine: "classic"):
// here we request the ENGINE-LESS client so there is NO Rust query-engine binary to
// bundle into the Lambda. This is the R4/R7 fix the spike is proving. If this fails to
// generate/run, fall back to bundling the Linux engine binary (plan §0.2 step 4).
export default defineConfig({
  schema: "prisma/schema.prisma",
  engine: "client",
});
