import { useQuery } from "@tanstack/react-query";

type TokenPriceData = {
  address: string;
  priceUsd: number;
  marketCap: number;
};

export function useListPrices(unitAddresses: string[]) {
  return useQuery({
    queryKey: ["listPrices", unitAddresses.length > 0 ? "batch" : "empty"],
    queryFn: async (): Promise<Map<string, TokenPriceData>> => {
      const priceMap = new Map<string, TokenPriceData>();

      if (unitAddresses.length === 0) return priceMap;

      // Only fetch first 30 to keep it fast
      const addressesToFetch = unitAddresses.slice(0, 30);

      try {
        const addresses = addressesToFetch.join(",");
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${addresses}`,
          { signal: AbortSignal.timeout(5000) } // 5 second timeout
        );

        if (!res.ok) return priceMap;

        const data = await res.json();
        const pairs = data.pairs || [];

        const tokenPairs = new Map<string, any>();

        for (const pair of pairs) {
          if (pair.chainId !== "base") continue;

          const tokenAddr = pair.baseToken?.address?.toLowerCase();
          if (!tokenAddr) continue;

          const existing = tokenPairs.get(tokenAddr);
          if (
            !existing ||
            (pair.liquidity?.usd || 0) > (existing.liquidity?.usd || 0)
          ) {
            tokenPairs.set(tokenAddr, pair);
          }
        }

        for (const [addr, pair] of tokenPairs) {
          priceMap.set(addr, {
            address: addr,
            priceUsd: parseFloat(pair.priceUsd || "0"),
            marketCap: pair.marketCap || 0,
          });
        }
      } catch (error) {
        console.error("Failed to fetch prices:", error);
      }

      return priceMap;
    },
    enabled: unitAddresses.length > 0,
    staleTime: 60_000, // 1 minute
    gcTime: 5 * 60_000, // 5 minutes cache
    refetchInterval: 120_000, // 2 minutes
    retry: false, // Don't retry on failure
  });
}