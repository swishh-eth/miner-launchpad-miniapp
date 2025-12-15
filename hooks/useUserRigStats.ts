import { useQuery } from "@tanstack/react-query";
import {
  getUserRigStats,
  getUserAllStats,
  type SubgraphUserRigStats,
} from "@/lib/subgraph-launchpad";

export type UserRigStats = {
  totalMined: bigint;
  totalSpent: bigint;
  totalEarned: bigint;
  mineCount: number;
};

function parseUserRigStats(stats: SubgraphUserRigStats): UserRigStats {
  return {
    totalMined: BigInt(stats.totalMined),
    totalSpent: BigInt(stats.totalSpent),
    totalEarned: BigInt(stats.totalEarned),
    mineCount: parseInt(stats.mineCount),
  };
}

export function useUserRigStats(
  userAddress: `0x${string}` | undefined,
  rigAddress: `0x${string}` | undefined
) {
  const { data: stats, isLoading, error, refetch } = useQuery({
    queryKey: ["userRigStats", userAddress, rigAddress],
    queryFn: async () => {
      if (!userAddress || !rigAddress) return null;
      const rawStats = await getUserRigStats(userAddress, rigAddress);
      return rawStats ? parseUserRigStats(rawStats) : null;
    },
    enabled: !!userAddress && !!rigAddress,
    staleTime: 15_000,
    refetchInterval: 15_000,
    retry: false,
  });

  return {
    stats,
    isLoading,
    error,
    refetch,
  };
}

export function useUserAllStats(userAddress: `0x${string}` | undefined) {
  const { data: allStats, isLoading, error, refetch } = useQuery({
    queryKey: ["userAllStats", userAddress],
    queryFn: async () => {
      if (!userAddress) return [];
      const rawStats = await getUserAllStats(userAddress);
      return rawStats.map(parseUserRigStats);
    },
    enabled: !!userAddress,
    staleTime: 30_000,
    retry: false,
  });

  return {
    allStats: allStats ?? [],
    isLoading,
    error,
    refetch,
  };
}
