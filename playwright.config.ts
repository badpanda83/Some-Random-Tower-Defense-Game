import { defineConfig, devices } from "@playwright/test";

const port = process.env.E2E_PORT ?? "3001";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 915, height: 412 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "corepack pnpm start",
    url: `${baseURL}/health/live`,
    env: {
      PORT: port,
      PUBLIC_URL: baseURL,
    },
    reuseExistingServer: !process.env.CI && !process.env.E2E_PORT,
    timeout: 120_000,
  },
});
