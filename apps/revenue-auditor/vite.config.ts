import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root,
  base: "/revenue-auditor/",
  plugins: [react()],
  server: {
    fs: {
      allow: [resolve(root, "../..")],
    },
  },
  build: {
    outDir: "../../revenue-auditor",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        marketing: resolve(root, "index.html"),
        login: resolve(root, "login/index.html"),
        app: resolve(root, "app/index.html"),
        account: resolve(root, "account/index.html"),
        admin: resolve(root, "admin/index.html"),
        legal: resolve(root, "legal/index.html"),
      },
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/test/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: [resolve(root, "src/test/setup.ts")],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
