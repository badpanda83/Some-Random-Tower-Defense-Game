import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["crest.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "The Dubious Realm",
        short_name: "Dubious Realm",
        description:
          "A fantasy-parody tower defense game for heroes with questionable equipment.",
        background_color: "#0d0a18",
        theme_color: "#171229",
        display: "standalone",
        orientation: "any",
        scope: "/",
        start_url: "/",
        categories: ["games", "entertainment"],
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ["**/*.{css,html,js,png,svg,woff2}"],
        navigateFallbackDenylist: [/^\/api\//, /^\/health\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/") ||
              url.pathname.startsWith("/health/"),
            handler: "NetworkOnly",
          },
        ],
      },
      devOptions: {
        enabled: true,
        navigateFallback: "index.html",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
      "/health": "http://localhost:3001",
    },
  },
});
