import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CONTRACT_ADDRESSES, NATIVE_ETH_ADDRESS } from "@/lib/contracts";
import { getRigs } from "@/lib/subgraph-launchpad";

export type SwapToken = {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoUrl?: string;
  isNative?: boolean;
  isLaunchpadToken?: boolean;
};

// Base tokens that are always available
export const BASE_TOKENS: SwapToken[] = [
  {
    address: NATIVE_ETH_ADDRESS,
    symbol: "ETH",
    name: "Ethereum",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    isNative: true,
  },
  {
    address: CONTRACT_ADDRESSES.weth,
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    logoUrl: "https://assets.coingecko.com/coins/images/2518/small/weth.png",
  },
  {
    address: CONTRACT_ADDRESSES.usdc,
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoUrl: "https://assets.coingecko.com/coins/images/6319/small/usdc.png",
  },
  {
    address: CONTRACT_ADDRESSES.donut,
    symbol: "DONUT",
    name: "Donut",
    decimals: 18,
    logoUrl: "/media/icon.png",
  },
];

// Default ETH token for initial state
export const DEFAULT_ETH_TOKEN = BASE_TOKENS[0];

// Convert ipfs:// URL to gateway URL
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

const ipfsToGateway = (uri: string) => {
  if (!uri) return undefined;
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
};

// Fetch metadata for a token to get its logo
async function fetchTokenLogo(unitUri: string): Promise<string | undefined> {
  try {
    const metadataUrl = ipfsToGateway(unitUri);
    if (!metadataUrl) return undefined;

    const res = await fetch(metadataUrl);
    const metadata = await res.json();
    return metadata.image ? ipfsToGateway(metadata.image) : undefined;
  } catch {
    return undefined;
  }
}

export function useSwapTokens() {
  const { data: launchpadTokens, isLoading } = useQuery({
    queryKey: ["swapTokens"],
    queryFn: async () => {
      // Fetch all rigs from subgraph
      const rigs = await getRigs(100, 0, "totalVolume", "desc");

      // Map to token format
      const tokens: SwapToken[] = rigs.map((rig) => ({
        address: rig.unit.id,
        symbol: rig.unit.symbol,
        name: rig.unit.name,
        decimals: 18, // All unit tokens are 18 decimals
        logoUrl: undefined,
        isLaunchpadToken: true,
      }));

      return tokens;
    },
    staleTime: 60_000, // Cache for 1 minute
  });

  // Memoize combined tokens to prevent creating new array references
  const allTokens = useMemo(
    () => [...BASE_TOKENS, ...(launchpadTokens || [])],
    [launchpadTokens]
  );

  return {
    tokens: allTokens,
    baseTokens: BASE_TOKENS,
    launchpadTokens: launchpadTokens || [],
    isLoading,
  };
}

// Helper to find a token by address
export function findToken(tokens: SwapToken[], address: string): SwapToken | undefined {
  return tokens.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
  );
}

// Helper to get token by symbol
export function findTokenBySymbol(tokens: SwapToken[], symbol: string): SwapToken | undefined {
  return tokens.find(
    (t) => t.symbol.toLowerCase() === symbol.toLowerCase()
  );
}
