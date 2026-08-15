/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  webpack: (config, { isServer }) => {
    // Limit parallelism to avoid EAGAIN readdir under memory pressure
    config.parallelism = 1;
    return config;
  },
  swcMinify: false,
};

module.exports = nextConfig;
