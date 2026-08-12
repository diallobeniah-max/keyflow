import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    {
      name: "csp",
      transformIndexHtml(html) {
        const csp = mode === "development"
          ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:1420 http://127.0.0.1:1420; img-src 'self' data:; font-src 'self' data:"
          : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'";
        return html.replace("</title>", `</title>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
      },
    },
  ],
  base: "./",
  clearScreen: false,
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));
