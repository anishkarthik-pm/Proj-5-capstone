/** @type {import('next').NextConfig} */
const nextConfig = {
  // Turbopack config (Next.js 16+ default)
  turbopack: {},

  // Webpack config (fallback for production builds)
  webpack: (config) => {
    // Handle raw file imports for markdown
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
