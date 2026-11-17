import { webEnv } from "./src/lib/load-env";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nestHttpOrigin = webEnv().API_INTERNAL_URL.replace(/\/api\/?$/, "");

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${nestHttpOrigin}/api/:path*`,
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
