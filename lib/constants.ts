import { base } from "wagmi/chains";

// Timing constants
export const SDK_READY_TIMEOUT_MS = 1200;
export const PRICE_CACHE_TTL_MS = 60_000;
export const PRICE_REFETCH_INTERVAL_MS = 60_000;

// Query stale times
export const STALE_TIME_SHORT_MS = 10_000;
export const STALE_TIME_MEDIUM_MS = 15_000;
export const STALE_TIME_LONG_MS = 30_000;
export const STALE_TIME_PROFILE_MS = 60_000;

// Transaction settings
export const DEADLINE_BUFFER_SECONDS = 15 * 60;

// Token decimals
export const TOKEN_DECIMALS = 18;

// Chain configuration
export const DEFAULT_CHAIN_ID = base.id;

// Default price fallbacks (USD)
export const DEFAULT_ETH_PRICE_USD = 3500;
export const DEFAULT_DONUT_PRICE_USD = 0.001;

// IPFS Gateways - use public ones as fallback
export const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "";
export const PINATA_GATEWAY_KEY = process.env.NEXT_PUBLIC_PINATA_GATEWAY_KEY || "";

// Public IPFS gateway (reliable fallback)
export const PUBLIC_IPFS_GATEWAY = "https://ipfs.io";

// Helper to convert IPFS URI to HTTP URL
export function ipfsToHttp(uri: string): string {
  if (!uri) return "";
  
  if (uri.startsWith("ipfs://")) {
    const cid = uri.slice(7);
    
    // Use private gateway if keys are available
    if (PINATA_GATEWAY && PINATA_GATEWAY_KEY) {
      return `${PINATA_GATEWAY}/ipfs/${cid}?pinataGatewayToken=${PINATA_GATEWAY_KEY}`;
    }
    
    // Otherwise use public gateway
    return `${PUBLIC_IPFS_GATEWAY}/ipfs/${cid}`;
  }
  
  // Handle URLs without protocol
  if (!uri.startsWith("http://") && !uri.startsWith("https://") && uri.includes(".")) {
    return `https://${uri}`;
  }
  
  return uri;
}

// File upload limits
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;

// Swap settings
export const SWAP_FEE_BPS = 40;
export const MIN_SLIPPAGE_PERCENT = 1;
export const MAX_SLIPPAGE_PERCENT = 49;
export const DEFAULT_SLIPPAGE_PERCENT = 2;