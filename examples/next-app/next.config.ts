import path from "node:path";

import type { NextConfig } from "next";

/**
 * The app imports the skill's templates straight from the plugin folder, two
 * levels above this one, so that CI proves the files users copy actually
 * compile. Turbopack only resolves files inside its root, so the root is the
 * repository, not this app.
 */
const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(process.cwd(), "..", ".."),
  },
};

export default nextConfig;
