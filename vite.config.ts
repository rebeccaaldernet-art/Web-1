import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import cloudflareDeploy from "./cloudflare.deploy.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

// DEPLOY_TARGET=cloudflare (pnpm run build:cloudflare) builds for your own Cloudflare account instead of Sites:
// real D1/R2 names from cloudflare.deploy.json, and sign-in through verified Cloudflare Access tokens.
const cloudflareTarget = process.env.DEPLOY_TARGET === "cloudflare";
const cloudflareConfig = {
  name: cloudflareDeploy.name,
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  vars: { AUTH_MODE: "cloudflare-access" },
  // Keep CF_ACCESS_* and other variables set in the Cloudflare dashboard when a new version is deployed.
  keep_vars: true,
  d1_databases: [{ binding: d1 || "DB", database_name: cloudflareDeploy.d1_database_name, database_id: cloudflareDeploy.d1_database_id, migrations_dir: "drizzle" }],
  r2_buckets: cloudflareDeploy.r2_bucket_name ? [{ binding: r2 || "BUCKET", bucket_name: cloudflareDeploy.r2_bucket_name }] : [],
  ...(cloudflareDeploy.cloudflare_email ? { send_email: [{ name: "EMAIL" }] } : {}),
};

const localBindingConfig = {
  main: "vinext/server/fetch-handler",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Use Miniflare's local Request.cf placeholder unless fetching is requested.
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= "false";
  process.env.WRANGLER_SEND_METRICS ??= "false";

  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.WRANGLER_REGISTRY_PATH ??= ".wrangler/dev-registry";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: cloudflareTarget ? cloudflareConfig : localBindingConfig,
      }),
    ],
  };
});
