import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useReadContract } from "wagmi";
import { base } from "wagmi/chains";
import { CONTRACT_ADDRESSES, CORE_ABI } from "@/lib/contracts";

export type PricePoint = {
  time: number;
  value: number;
};

export type DexScreenerPair = {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  liquidity: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv: number;
  marketCap: number;
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
  priceChange: {
    h24: number;
    h6: number;
    h1: number;
    m5: number;
  };
};

async function fetchDexScreenerByPair(pairAddress: string): Promise<DexScreenerPair | null> {
  if (!pairAddress || pairAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/pairs/base/${pairAddress.toLowerCase()}`
    );

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    const pair = json.pair ?? json.pairs?.[0];

    if (!pair) {
      return null;
    }

    return pair as DexScreenerPair;
  } catch {
    return null;
  }
}

async function fetchDexScreenerByToken(tokenAddress: string): Promise<DexScreenerPair | null> {
  if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
    return null;
  }

  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress.toLowerCase()}`
    );

    if (!response.ok) {
      return null;
    }

    const json = await response.json();
    // Returns { pairs: [...] } - find the Base chain pair with highest liquidity
    const basePairs = (json.pairs ?? []).filter(
      (p: DexScreenerPair) => p.chainId === "base"
    );

    if (basePairs.length === 0) {
      return null;
    }

    // Sort by liquidity and return the most liquid pair
    basePairs.sort((a: DexScreenerPair, b: DexScreenerPair) =>
      (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0)
    );

    return basePairs[0] as DexScreenerPair;
  } catch {
    return null;
  }
}

async function fetchDexScreenerData(
  pairAddress: string,
  tokenAddress?: string
): Promise<DexScreenerPair | null> {
  // Try by pair address first
  const pairResult = await fetchDexScreenerByPair(pairAddress);
  if (pairResult) {
    return pairResult;
  }

  // Fallback to token address
  if (tokenAddress) {
    return fetchDexScreenerByToken(tokenAddress);
  }

  return null;
}

// Create price history from DexScreener pair data
function createPriceHistoryFromPair(pair: DexScreenerPair): PricePoint[] {
  const now = Math.floor(Date.now() / 1000);
  const currentPrice = parseFloat(pair.priceUsd) || 0;

  if (currentPrice === 0) return [];

  // Calculate historical prices based on price change percentages
  const priceChange24h = pair.priceChange?.h24 ?? 0;
  const priceChange6h = pair.priceChange?.h6 ?? 0;
  const priceChange1h = pair.priceChange?.h1 ?? 0;
  const priceChange5m = pair.priceChange?.m5 ?? 0;

  // Work backwards from current price
  const price24hAgo = currentPrice / (1 + priceChange24h / 100);
  const price6hAgo = currentPrice / (1 + priceChange6h / 100);
  const price1hAgo = currentPrice / (1 + priceChange1h / 100);
  const price5mAgo = currentPrice / (1 + priceChange5m / 100);

  // Create interpolated points for a smoother chart
  const points: PricePoint[] = [];

  // 24h ago
  points.push({ time: now - 24 * 3600, value: price24hAgo });

  // Interpolate between 24h and 6h
  const steps24to6 = 6;
  for (let i = 1; i < steps24to6; i++) {
    const t = i / steps24to6;
    const time = now - 24 * 3600 + (18 * 3600 * t);
    const value = price24hAgo + (price6hAgo - price24hAgo) * t;
    points.push({ time: Math.floor(time), value });
  }

  // 6h ago
  points.push({ time: now - 6 * 3600, value: price6hAgo });

  // Interpolate between 6h and 1h
  const steps6to1 = 5;
  for (let i = 1; i < steps6to1; i++) {
    const t = i / steps6to1;
    const time = now - 6 * 3600 + (5 * 3600 * t);
    const value = price6hAgo + (price1hAgo - price6hAgo) * t;
    points.push({ time: Math.floor(time), value });
  }

  // 1h ago
  points.push({ time: now - 3600, value: price1hAgo });

  // Interpolate between 1h and 5m
  const steps1hto5m = 11;
  for (let i = 1; i < steps1hto5m; i++) {
    const t = i / steps1hto5m;
    const time = now - 3600 + (55 * 60 * t);
    const value = price1hAgo + (price5mAgo - price1hAgo) * t;
    points.push({ time: Math.floor(time), value });
  }

  // 5m ago
  points.push({ time: now - 5 * 60, value: price5mAgo });

  // Interpolate to now
  const stepsToNow = 5;
  for (let i = 1; i <= stepsToNow; i++) {
    const t = i / stepsToNow;
    const time = now - 5 * 60 + (5 * 60 * t);
    const value = price5mAgo + (currentPrice - price5mAgo) * t;
    points.push({ time: Math.floor(time), value });
  }

  return points;
}

// Create a flat line chart from a single price value (fallback)
function createFlatPriceHistory(price: number): PricePoint[] {
  if (price <= 0) return [];

  const now = Math.floor(Date.now() / 1000);
  const points: PricePoint[] = [];

  // Create 24 points over the last 24 hours at the same price
  for (let i = 24; i >= 0; i--) {
    points.push({
      time: now - i * 3600,
      value: price,
    });
  }

  return points;
}

export function usePriceHistory(
  rigAddress: `0x${string}` | undefined,
  fallbackPrice?: number,
  unitAddress?: `0x${string}`
) {
  // Get LP token address from Core contract
  const { data: lpAddress, isLoading: isLoadingLp } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "rigToLP",
    args: rigAddress ? [rigAddress] : undefined,
    chainId: base.id,
    query: {
      enabled: !!rigAddress,
    },
  });

  const { data: pairData, isLoading: isLoadingPair } = useQuery({
    queryKey: ["dexScreenerPair", lpAddress, unitAddress],
    queryFn: () => fetchDexScreenerData(lpAddress as string, unitAddress),
    enabled: !!lpAddress || !!unitAddress,
    staleTime: 30_000,
    refetchInterval: 30_000,
    retry: false,
  });

  // Create price history from pair data, or use fallback - memoized to prevent unnecessary recalculations
  const priceHistory = useMemo(() => {
    if (pairData) {
      return createPriceHistoryFromPair(pairData);
    }
    if (fallbackPrice && fallbackPrice > 0) {
      return createFlatPriceHistory(fallbackPrice);
    }
    return [];
  }, [pairData, fallbackPrice]);

  // Still loading if we're fetching LP address or DexScreener data
  const isLoading = isLoadingLp || (!!lpAddress && isLoadingPair);

  return {
    priceHistory,
    pairData: pairData ?? null,
    isLoading,
    lpAddress: lpAddress as `0x${string}` | undefined,
  };
}

// Generate mock data for testing/fallback
export function generateMockPriceData(days: number = 7): PricePoint[] {
  const now = Math.floor(Date.now() / 1000);
  const points: PricePoint[] = [];
  let price = 0.001 + Math.random() * 0.01;

  for (let i = days * 24; i >= 0; i--) {
    const time = now - i * 3600;
    // Random walk
    price = price * (1 + (Math.random() - 0.48) * 0.1);
    price = Math.max(0.0001, price);
    points.push({ time, value: price });
  }

  return points;
}
