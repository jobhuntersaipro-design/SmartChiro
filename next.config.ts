import type { NextConfig } from "next";

// Pull the R2 public URL hostname out of the env so we can whitelist it
// for next/image. Falls back to a wildcard r2.dev / r2.cloudflarestorage.com
// pattern when the var is missing (dev / preview builds), so the build
// doesn't blow up on a fresh checkout.
function r2Hostname(): string {
  const raw = process.env.R2_PUBLIC_URL?.trim();
  if (!raw) return "*.r2.dev";
  try {
    return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname;
  } catch {
    return "*.r2.dev";
  }
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  devIndicators: false,
  images: {
    // Allow X-ray thumbnails served from R2 through next/image's optimizer.
    // Adding a public R2 endpoint here is what unlocks the responsive
    // sizing + AVIF/WebP transcoding for our gallery thumbnails — without
    // it next/image rejects the host and falls back to the unoptimized
    // pass-through (which is what the no-img-element lint rule flags).
    remotePatterns: [
      { protocol: "https", hostname: r2Hostname() },
      // Cloudflare's S3-style endpoint, used by some R2 setups.
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
};

export default nextConfig;
