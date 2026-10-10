import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://127.0.0.1:3001" },
  webServer: {
    command: "npx http-server . -p 3001 -a 0.0.0.0 -c-1",
    url: "http://127.0.0.1:3001",
    reuseExistingServer: false,
  },
});
