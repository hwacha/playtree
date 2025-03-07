import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/*.css"],
    }),
    tsconfigPaths(),
  ],
  resolve: {
    alias: [
      {
        find: /^@mui\/icons-material\/(.*)/,
        replacement: "@mui/icons-material/esm/$1",
      },
      {
        find: /^@emotion\/styled\/(.*)/,
        replacement: "@emotion/styled/esm/$1",
      }
    ]
  },
  server: {
    hmr: false
  }
});
