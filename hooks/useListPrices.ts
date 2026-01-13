import { useQuery } from "@tanstack/react-query";

type TokenPriceData = {
  address: string;
  priceUsd: number;
  marketCap: number;
};

export function useListPrices(unitAddresses: string[]) {
  return useQuery({
    queryKey: ["listPrices", unitAddresses.sort().join(",")],
    queryFn: async (): Promise<Map<string, TokenPriceData>> => {
      const priceMap = new Map<string, TokenPriceData>();

      if (unitAddresses.length === 0) return priceMap;

      // DexScreener allows fetching multiple tokens at once (comma-separated)
      // Max ~30 addresses per request to avoid URL length issues
      const chunks: string[][] = [];
      for (let i = 0; i < unitAddresses.length; i += 30) {
        chunks.push(unitAddresses.slice(i, i + 30));
      }

      await Promise.all(
        chunks.map(async (chunk) => {
          try {
            const addresses = chunk.join(",");
            const res = await fetch(
              `https://api.dexscreener.com/latest/dex/tokens/${addresses}`
            );

            if (!res.ok) return;

            const data = await res.json();
            const pairs = data.pairs || [];

            // Group pairs by token address, keep highest liquidity pair
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

            // Add to price map
            for (const [addr, pair] of tokenPairs) {
              priceMap.set(addr, {
                address: addr,
                priceUsd: parseFloat(pair.priceUsd || "0"),
                marketCap: pair.marketCap || 0,
              });
            }
          } catch (error) {
            console.error("Failed to fetch prices for chunk:", error);
          }
        })
      );

      return priceMap;
    },
    enabled: unitAddresses.length > 0,
    staleTime: 30_000, // 30 seconds
    refetchInterval: 60_000, // 1 minute
  });
}