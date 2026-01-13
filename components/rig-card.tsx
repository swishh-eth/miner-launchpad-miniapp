"use client";

import { useEffect, useState, memo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatEther } from "viem";
import { Crown, Pickaxe, TrendingUp } from "lucide-react";
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
  return `$${value.toFixed(2)}`;
};

const formatTimeAgo = (timestamp: number): string => {
  if (!timestamp) return "";
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
};

type RigCardProps = {
  rig: RigListItem;
  donutUsdPrice?: number;
  rank?: number;
  isKing?: boolean;
  isNewBump?: boolean;
};

export const RigCard = memo(function RigCard({
  rig,
  donutUsdPrice = 0.01,
  rank,
  isKing = false,
  isNewBump = false,
}: RigCardProps) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Calculate market cap
  const marketCapUsd =
    rig.unitPrice > 0n
      ? Number(formatEther(rig.totalMinted)) *
        Number(formatEther(rig.unitPrice)) *
        donutUsdPrice
      : 0;

  // Calculate token price in USD
  const tokenPriceUsd =
    rig.unitPrice > 0n
      ? Number(formatEther(rig.unitPrice)) * donutUsdPrice
      : 0;

  // Fetch metadata for logo
  useEffect(() => {
    if (!rig.rigUri) return;
    const metadataUrl = ipfsToHttp(rig.rigUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {});
  }, [rig.rigUri]);

  return (
    <Link href={`/rig/${rig.address}`} className="block">
      <motion.div
        layout
        initial={isNewBump ? { scale: 1.02, opacity: 0.8 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          layout: { type: "spring", stiffness: 500, damping: 35 },
          scale: { duration: 0.2 },
        }}
        className={cn(
          "relative flex items-center gap-3 p-3 rounded-2xl transition-all cursor-pointer border",
          isKing
            ? "bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent border-yellow-500/30 shadow-[0_0_20px_rgba(234,179,8,0.15)]"
            : "bg-zinc-900/80 border-zinc-800/50 hover:bg-zinc-800/80 hover:border-zinc-700/50",
          isNewBump && "animate-pulse"
        )}
      >
        {/* Rank Badge */}
        {rank !== undefined && (
          <div
            className={cn(
              "absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
              isKing
                ? "bg-yellow-500 text-black"
                : rank <= 3
                  ? "bg-purple-500 text-black"
                  : "bg-zinc-700 text-zinc-300"
            )}
          >
            {isKing ? <Crown className="w-3.5 h-3.5" /> : rank}
          </div>
        )}

        {/* Token Logo */}
        <div
          className={cn(
            "relative flex-shrink-0 w-11 h-11 rounded-xl overflow-hidden",
            isKing ? "ring-2 ring-yellow-500/50" : "bg-zinc-800"
          )}
        >
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={rig.tokenSymbol}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
              <span className="text-purple-500 font-bold">
                {rig.tokenSymbol.slice(0, 2)}
              </span>
            </div>
          )}
        </div>

        {/* Token Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-white truncate text-sm">
              {rig.tokenName}
            </span>
            {isKing && (
              <Crown className="w-3.5 h-3.5 text-yellow-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-zinc-500">{rig.tokenSymbol}</span>
            {rig.createdAt > 0 && (
              <span className="text-[10px] text-zinc-600">
                {formatTimeAgo(rig.createdAt)} ago
              </span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex-shrink-0 text-right space-y-0.5">
          {/* Market Cap */}
          <div className="text-sm font-semibold text-white">
            {formatUsd(marketCapUsd)}
          </div>
          {/* Mine Price */}
          <div className="flex items-center justify-end gap-1 text-[11px] text-zinc-500">
            <Pickaxe className="w-3 h-3" />
            <span>Ξ{formatEth(rig.price, 4)}</span>
          </div>
        </div>

        {/* Activity Indicator - shows epoch count */}
        {rig.epochCount > 0 && (
          <div className="flex-shrink-0 flex flex-col items-center justify-center px-2 border-l border-zinc-800">
            <div className="text-xs font-semibold text-purple-400">
              {rig.epochCount}
            </div>
            <div className="text-[9px] text-zinc-600">mines</div>
          </div>
        )}
      </motion.div>
    </Link>
  );
});