import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import { defineConfig, loadEnv } from "vite";

const envDir = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, envDir, "INTERNAL_API_URL");
  const backend = env.INTERNAL_API_URL ?? "http://127.0.0.1:8000";

  if (command === "serve") {
    process.env.INTERNAL_API_URL ??= backend;
  }

  return {
    envDir,
    plugins: [reactRouter()],
    server: {
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "^/api(?:/|$)": backend,
        "^/media(?:/|$)": backend,
      },
    },
  };
});
