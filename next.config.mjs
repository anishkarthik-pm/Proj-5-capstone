/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Webpack config
  webpack: (config) => {
    // Handle raw file imports for markdown
    config.module.rules.push({
      test: /\.md$/,
      type: 'asset/source',
    });
    return config;
  },

  // Image optimization configuration
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
