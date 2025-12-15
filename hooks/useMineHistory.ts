import { useQuery } from "@tanstack/react-query";
import { getMineHistory, type SubgraphMine } from "@/lib/subgraph-launchpad";

export type MineMessage = {
  id: string;
  miner: `0x${string}`;
  price: bigint;
  uri: string;
  timestamp: number;
  minedAmount: bigint;
  txHash: string;
};

function parseMineFromSubgraph(mine: SubgraphMine): MineMessage {
  return {
    id: mine.id,
    miner: mine.miner.toLowerCase() as `0x${string}`,
    price: BigInt(mine.price),
    uri: mine.uri,
    timestamp: parseInt(mine.timestamp),
    minedAmount: BigInt(mine.minedAmount),
    txHash: mine.txHash,
  };
}

export function useMineHistory(
  rigAddress: `0x${string}` | undefined,
  first = 50,
  skip = 0
) {
  const {
    data: mines,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["mineHistory", rigAddress, first, skip],
    queryFn: async () => {
      if (!rigAddress) return [];
      const rawMines = await getMineHistory(rigAddress, first, skip);
      // Parse and reverse to get chronological order (oldest first for chat)
      return rawMines.map(parseMineFromSubgraph).reverse();
    },
    enabled: !!rigAddress,
    staleTime: 10_000, // 10 seconds
    refetchInterval: 10_000, // Refetch every 10 seconds for new messages
    retry: false, // Don't retry - subgraph may be unavailable
  });

  return {
    mines: mines ?? [],
    isLoading,
    error,
    refetch,
  };
}

export function useMineHistoryPaginated(
  rigAddress: `0x${string}` | undefined,
  pageSize = 20
) {
  const {
    data: mines,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["mineHistoryPaginated", rigAddress],
    queryFn: async () => {
      if (!rigAddress) return [];
      const rawMines = await getMineHistory(rigAddress, pageSize, 0);
      return rawMines.map(parseMineFromSubgraph).reverse();
    },
    enabled: !!rigAddress,
    staleTime: 10_000,
    refetchInterval: 10_000,
    retry: false,
  });

  return {
    mines: (mines as MineMessage[]) ?? [],
    isLoading,
    error,
    refetch,
    // Pagination stubs for future infinite scroll implementation
    fetchNextPage: async () => {},
    hasNextPage: false,
    isFetchingNextPage: false,
  };
}
