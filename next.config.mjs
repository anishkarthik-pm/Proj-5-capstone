/** @type {import('next').NextConfig} */
const nextConfig = {
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
