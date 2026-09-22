// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Publika (publishable) backend-värden. .env är gitignorerad, så produktionsbygget
// saknade dessa och klientbundlen kastade "Missing Supabase environment variable(s)".
// Dessa värden är publika (anon key) och säkra att bygga in.
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://yakwdirpbwdtsdpxlbkp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlha3dkaXJwYndkdHNkcHhsYmtwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyNjgxMzMsImV4cCI6MjA5NTg0NDEzM30.pRz3FSvnJ95MN9jqK7dbvY_Is0dZGqOAlRSz1Duz38Y";
const SUPABASE_PROJECT_ID = process.env.VITE_SUPABASE_PROJECT_ID || "yakwdirpbwdtsdpxlbkp";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(SUPABASE_URL),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(SUPABASE_PUBLISHABLE_KEY),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(SUPABASE_PROJECT_ID),
    },
  },
});
