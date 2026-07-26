import { build } from "esbuild";

const entryPoints = [
  "supabase/functions/send-auth-email/index.ts",
  "supabase/functions/delete-account/index.ts",
  "supabase/functions/boc-rates/index.ts"
];

await Promise.all(entryPoints.map((entryPoint) => build({
  entryPoints: [entryPoint],
  bundle: true,
  write: false,
  platform: "neutral",
  format: "esm",
  external: ["*"],
  logLevel: "silent"
})));

console.log(`Edge Function syntax check passed for ${entryPoints.length} functions.`);
