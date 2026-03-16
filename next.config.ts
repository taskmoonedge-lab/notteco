import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "app.notteco.com",
          },
        ],
        destination: "https://notteco.com/:path*",
        permanent: true,
      },
      {
        source: "/:path*",
        has: [
          {
            type: "host",
            value: "www.notteco.com",
          },
        ],
        destination: "https://notteco.com/:path*",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
