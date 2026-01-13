"use client";

import { useEffect, useState, memo } from "react";
import Link from "next/link";
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

type RigCardProps = {
  rig: RigListItem;
  donutUsdPrice?: number;
  marketCapUsd?: number; // <-- Add this prop
  isKing?: boolean;
  isNewBump?: boolean;
};

export const RigCard = memo(function RigCard({
  rig,
  donutUsdPrice = 0.01,
  marketCapUsd: externalMarketCap, // <-- Destructure it
  isKing = false,
  isNewBump = false,
}: RigCardProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);

  // Use external market cap (DexScreener) if available, otherwise calculate from on-chain
  const marketCapUsd =
    externalMarketCap !== undefined && externalMarketCap > 0
      ? externalMarketCap
      : rig.unitPrice > 0n
        ? Number(formatEther(rig.totalMinted)) *
          Number(formatEther(rig.unitPrice)) *
          donutUsdPrice
        : 0;

  // Fetch metadata for logo
  useEffect(() => {
    if (!rig.rigUri) return;

    const metadataUrl = ipfsToHttp(rig.rigUri);
    if (!metadataUrl) return;

    setImageError(false);

    fetch(metadataUrl)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      })
      .then((metadata) => {
        if (metadata.image) {
          const imageUrl = ipfsToHttp(metadata.image);
          if (imageUrl) {
            setLogoUrl(imageUrl);
          }
        }
      })
      .catch(() => {
        setImageError(true);
      });
  }, [rig.rigUri]);

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
          {logoUrl && !imageError ? (
            <img
              src={logoUrl}
              alt={rig.tokenSymbol}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <span className="text-purple-500 font-bold text-lg">
                {rig.tokenSymbol.slice(0, 2)}
              </span>
            </div>
          )}
          {/* Crown badge for king */}
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