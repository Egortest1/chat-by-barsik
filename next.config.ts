import type { NextConfig } from 'next';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const nextConfig: NextConfig = isGitHubPages
  ? { output: 'export', basePath: '/chat-by-barsik', assetPrefix: '/chat-by-barsik/' }
  : {};

export default nextConfig;
