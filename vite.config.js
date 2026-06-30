import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// The VitePWA plugin auto-generates the service worker and links the manifest.
// This is what makes the site installable ("Add to Home Screen") and work offline.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Ledger — Budget",
        short_name: "Ledger",
        description: "Track income, expenses, and your Needs/Wants/Savings split.",
        theme_color: "#0B1120",
        background_color: "#0B1120",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
});
