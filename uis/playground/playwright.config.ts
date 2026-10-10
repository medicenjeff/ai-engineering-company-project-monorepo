import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";

export default defineConfig({
  testDir: "./tests",
  projects: [
    { name: "playground", use: { baseURL: "http://127.0.0.1:3001" } },
    { name: "backoffice", testMatch: /auth.*\.spec\.ts/, use: { baseURL: "http://127.0.0.1:5174" } },
  ],
  webServer: [
    { command: "npx next start --port 3001", env: { FASTAPI_URL: "http://127.0.0.1:8002" }, url: "http://127.0.0.1:3001", reuseExistingServer: false },
    { command: "npm run start --workspace @repo/nexova-backoffice -- --port 5174", env: { FASTAPI_URL: "http://127.0.0.1:8002" }, cwd: "../..", url: "http://127.0.0.1:5174", reuseExistingServer: false },
    {
      command: ".venv/bin/uvicorn --app-dir src ai_engineering_company_project_monorepo.api.main:app --port 8002",
      cwd: "../..",
      env: { JWT_SECRET_KEY: "isolated-auth-e2e-secret", TINYDB_PATH: `${tmpdir()}/nexova-auth-e2e-${process.pid}.json` },
      url: "http://127.0.0.1:8002/openapi.json",
      reuseExistingServer: false,
    },
  ],
});
