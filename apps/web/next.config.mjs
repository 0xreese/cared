import path from 'path'
import { fileURLToPath } from 'url'
import withBundleAnalyzer from '@next/bundle-analyzer'
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare'
import { createJiti } from 'jiti'

const jiti = createJiti(import.meta.url)

// Import env files to validate at build time. Use jiti so we can load .ts files in here.
await jiti.import('./src/env')

// @ts-ignore
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

initOpenNextCloudflareForDev()

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,

  /** Enables hot reloading for local packages without a build step */
  transpilePackages: [
    '@cared/shared',
    '@cared/api',
    '@cared/auth',
    '@cared/db',
    '@cared/i18n',
    '@cared/kv',
    '@cared/providers',
    '@cared/tokenizer',
    '@cared/ui',
    '@cared/crypto',
  ],

  /** We already do linting and typechecking as separate tasks in CI */
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },

  experimental: {
    // https://nextjs.org/docs/app/building-your-application/data-fetching/fetching#preventing-sensitive-data-from-being-exposed-to-the-client
    taint: true,
  },

  logging: {
    fetches: {
      fullUrl: true,
    },
  },

  // outputFileTracingIncludes: {
  //   '/api/rpc/\\[\\[...all\\]\\]': ['../../packages/tokenizer/assets/tokenizers/*'],
  // },
  // outputFileTracingRoot: path.join(__dirname, '../../'),

  // serverExternalPackages: ['@agnai/web-tokenizers'],
}

const configWithBundleAnalyzer = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})(config)

export default configWithBundleAnalyzer
