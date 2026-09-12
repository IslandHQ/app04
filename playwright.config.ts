import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: ["**/tests/*.spec.ts", "**/verify_logic.spec.ts"],
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:8790", trace: "retain-on-failure" },
  webServer: {
    command:
      "npx wrangler d1 migrations apply app04-db --local --persist-to .wrangler-test && npx wrangler dev --port 8790 --persist-to .wrangler-test",
    url: "http://127.0.0.1:8790/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
