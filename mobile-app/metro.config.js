// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

const wrapped = withNativeWind(config, { input: './global.css' });

// One Metro cache PER ENVIRONMENT. EXPO_PUBLIC_* values are inlined when a
// file is transformed, but the transform cache key does not include them — so
// a production export run after a sandbox one reused the sandbox-compiled
// src/lib/environment.ts and shipped every VTPass test number in the
// production bundle. Seen in a grep of the built .hbc, not theorised; `--clear`
// fixed it, and this makes forgetting `--clear` harmless. cacheVersion is
// folded into every cache key. Unset means production, as in environment.ts.
wrapped.cacheVersion = `${wrapped.cacheVersion ?? ''}|milipay-env:${
  process.env.EXPO_PUBLIC_MILIPAY_ENVIRONMENT === 'sandbox' ? 'sandbox' : 'production'
}`;

module.exports = wrapped;
