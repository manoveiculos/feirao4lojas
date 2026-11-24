import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
  env: {
    // Allow server/hosting env names without NEXT_PUBLIC_ prefix as fallback
    NEXT_PUBLIC_WHATSAPP_NUMBER:
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
      process.env.WHATSAPP_NUMBER ||
      '',
    NEXT_PUBLIC_N8N_WEBHOOK_URL:
      process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ||
      process.env.N8N_WEBHOOK_URL ||
      '',
  },
};

export default nextConfig;
