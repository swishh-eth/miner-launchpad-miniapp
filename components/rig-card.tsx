"use client";

import { memo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Crown } from "lucide-react";
import type { RigListItem } from "@/hooks/useAllRigs";
import { cn } from "@/lib/utils";
import { ipfsToHttp } from "@/lib/constants";

const formatEth = (value: bigint, maximumFractionDigits = 4) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const formatUsd = (value: number) => {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value > 0) return `$${value.toFixed(4)}`;
  return "$0.00";
};

// Fetch and cache metadata
function useRigMetadata(rigUri: string | undefined) {
  return useQuery({
    queryKey: ["rig-metadata", rigUri],
    queryFn: async () => {
      if (!rigUri) return null;
      
      const metadataUrl = ipfsToHttp(rigUri);
      if (!metadataUrl) return null;

      const res = await fetch(metadataUrl, {
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (!res.ok) return null;
      
      const metadata = await res.json();
      return {
        image: metadata.image ? ipfsToHttp(metadata.image) : null,
        name: metadata.name,
        description: metadata.description,
      };
    },
    enabled: !!rigUri,
    staleTime: 5 * 60_000, // 5 minutes
    gcTime: 30 * 60_000, // 30 minutes cache
    retry: false,
  });
}

type RigCardProps = {
  rig: RigListItem;
  donutUsdPrice?: number;
  marketCapUsd?: number;
  isKing?: boolean;
  isNewBump?: boolean;
};

export const RigCard = memo(function RigCard({
  rig,
  donutUsdPrice = 0.01,
  marketCapUsd: externalMarketCap,
  isKing = false,
  isNewBump = false,
}: RigCardProps) {
  const { data: metadata } = useRigMetadata(rig.rigUri);

  const marketCapUsd =
    externalMarketCap !== undefined && externalMarketCap > 0
      ? externalMarketCap
      : rig.unitPrice > 0n
        ? Number(formatEther(rig.totalMinted)) *
          Number(formatEther(rig.unitPrice)) *
          donutUsdPrice
        : 0;

  const logoUrl = metadata?.image;

  return (
    <Link href={`/rig/${rig.address}`} className="block mb-1.5">
      <div
        className={cn(
          "relative flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer",
          isKing
            ? "bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent border border-yellow-500/30"
            : "bg-zinc-900 hover:bg-zinc-800",
          isNewBump && "animate-pulse"
        )}
      >
        {/* Token Logo */}
        <div
          className={cn(
            "relative flex-shrink-0 w-12 h-12 rounded-xl overflow-hidden bg-zinc-800",
            isKing && "ring-2 ring-yellow-500/50"
          )}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={rig.tokenSymbol}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-purple-500 font-bold text-lg">
                {rig.tokenSymbol.slice(0, 2)}
              </span>
            </div>
          )}
          {isKing && (
            <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-500 rounded-full flex items-center justify-center">
              <Crown className="w-3 h-3 text-black" />
            </div>
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-white truncate">
            {rig.tokenName}
          </div>
          <div className="text-sm text-zinc-500">{rig.tokenSymbol}</div>
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 text-right">
          <div className="text-sm font-semibold text-purple-500">
            Ξ{formatEth(rig.price, 4)}
          </div>
          <div className="text-xs text-zinc-500">
            {formatUsd(marketCapUsd)} mcap
          </div>
        </div>
      </div>
    </Link>
  );
});