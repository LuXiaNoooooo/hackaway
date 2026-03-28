import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHomeApiMiddleware } from "./mockHomeApi.js";

function homeApiPlugin() {
  const middleware = createHomeApiMiddleware();
  return {
    name: "home-api",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    }
  };
}

export default defineConfig({
  plugins: [react(), homeApiPlugin()],
  server: {
    host: "0.0.0.0",
    port: 5173
  }
});
