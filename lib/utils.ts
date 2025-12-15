import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Price cache
let ethPriceCache: { price: number; timestamp: number } | null = null;
let donutPriceCache: { price: number; timestamp: number } | null = null;
const CACHE_DURATION = 60_000; // 1 minute cache

/**
 * Fetches the current ETH to USD price from CoinGecko API
 * Returns cached value if available and fresh (< 1 minute old)
 */
export async function getEthPrice(): Promise<number> {
  // Return cached price if still valid
  if (ethPriceCache && Date.now() - ethPriceCache.timestamp < CACHE_DURATION) {
    return ethPriceCache.price;
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error("Failed to fetch ETH price");
    }

    const data = await response.json();
    const price = data.ethereum?.usd;

    if (typeof price !== "number") {
      throw new Error("Invalid price data");
    }

    // Update cache
    ethPriceCache = {
      price,
      timestamp: Date.now(),
    };

    return price;
  } catch (error) {
    console.error("Error fetching ETH price:", error);
    // Fallback to a reasonable default if fetch fails
    return 3500;
  }
}

/**
 * Fetches the current DONUT to USD price from CoinGecko API
 * Returns cached value if available and fresh (< 1 minute old)
 */
export async function getDonutPrice(): Promise<number> {
  // Return cached price if still valid
  if (donutPriceCache && Date.now() - donutPriceCache.timestamp < CACHE_DURATION) {
    return donutPriceCache.price;
  }

  try {
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=donut-2&vs_currencies=usd"
    );

    if (!response.ok) {
      throw new Error("Failed to fetch DONUT price");
    }

    const data = await response.json();
    const price = data["donut-2"]?.usd;

    if (typeof price !== "number") {
      throw new Error("Invalid price data");
    }

    // Update cache
    donutPriceCache = {
      price,
      timestamp: Date.now(),
    };

    return price;
  } catch (error) {
    console.error("Error fetching DONUT price:", error);
    // Fallback to a reasonable default if fetch fails
    return 0.001;
  }
}
