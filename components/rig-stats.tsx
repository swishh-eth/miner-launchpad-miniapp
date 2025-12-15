"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther, formatUnits, zeroAddress } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { RigState } from "@/lib/contracts";

const TOKEN_DECIMALS = 18;

type RigStatsProps = {
  rigState: RigState | undefined;
  tokenSymbol: string;
  ethUsdPrice: number;
  glazeElapsedSeconds: number;
  interpolatedGlazed: bigint | null;
  currentUserAddress?: `0x${string}`;
};

const formatTokenAmount = (
  value: bigint,
  decimals: number,
  maximumFractionDigits = 2
) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return formatUnits(value, decimals);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

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

const formatAddress = (addr?: string) => {
  if (!addr) return "—";
  if (addr === zeroAddress) return "No miner";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
};

const formatTime = (seconds: number): string => {
  if (seconds < 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
};

export function RigStats({
  rigState,
  tokenSymbol,
  ethUsdPrice,
  glazeElapsedSeconds,
  interpolatedGlazed,
  currentUserAddress,
}: RigStatsProps) {
  const minerAddress = rigState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;
  const isCurrentUserMiner =
    currentUserAddress &&
    minerAddress.toLowerCase() === currentUserAddress.toLowerCase();

  // Fetch miner profile
  const { data: neynarUser } = useQuery<{
    user: {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null;
  }>({
    queryKey: ["neynar-user", minerAddress],
    queryFn: async () => {
      const res = await fetch(
        `/api/neynar/user?address=${encodeURIComponent(minerAddress)}`
      );
      if (!res.ok) return { user: null };
      return res.json();
    },
    enabled: hasMiner,
    staleTime: 60_000,
    retry: false,
  });

  const minerDisplay = useMemo(() => {
    if (!hasMiner) return { name: "No miner", avatar: null };
    const profile = neynarUser?.user;
    const name =
      profile?.displayName ??
      (profile?.username ? `@${profile.username}` : formatAddress(minerAddress));
    const avatar =
      profile?.pfpUrl ??
      `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
        minerAddress.toLowerCase()
      )}`;
    return { name, avatar };
  }, [hasMiner, neynarUser, minerAddress]);

  // Calculate USD values
  const glazedAmount = interpolatedGlazed ?? rigState?.glazed ?? 0n;
  const glazedUsd =
    rigState && rigState.unitPrice > 0n
      ? Number(formatUnits(glazedAmount, TOKEN_DECIMALS)) *
        Number(formatEther(rigState.unitPrice)) *
        ethUsdPrice
      : 0;

  const rateUsd =
    rigState && rigState.unitPrice > 0n
      ? Number(formatUnits(rigState.nextUps, TOKEN_DECIMALS)) *
        Number(formatEther(rigState.unitPrice)) *
        ethUsdPrice
      : 0;

  const priceUsd = rigState
    ? Number(formatEther(rigState.price)) * ethUsdPrice
    : 0;

  // Calculate PNL
  const pnl = rigState
    ? (rigState.price * 80n) / 100n - rigState.initPrice / 2n
    : 0n;
  const pnlPositive = pnl >= 0n;
  const pnlUsd = Number(formatEther(pnlPositive ? pnl : -pnl)) * ethUsdPrice;
  const totalUsd = glazedUsd + (pnlPositive ? pnlUsd : -pnlUsd);

  return (
    <Card
      className={cn(
        "border-zinc-800 bg-gradient-to-br from-zinc-950 to-black",
        isCurrentUserMiner &&
          "border-pink-500 shadow-[inset_0_0_24px_rgba(236,72,153,0.3)]"
      )}
    >
      <div className="p-2">
        {/* Miner Row */}
        <div className="flex items-center gap-2 mb-2">
          <Avatar className="h-7 w-7 ring-1 ring-zinc-800">
            {minerDisplay.avatar && (
              <AvatarImage src={minerDisplay.avatar} alt={minerDisplay.name} />
            )}
            <AvatarFallback className="bg-zinc-800 text-white text-[10px]">
              {hasMiner ? minerAddress.slice(-2).toUpperCase() : "—"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div
              className={cn(
                "text-xs font-semibold truncate",
                isCurrentUserMiner ? "text-pink-500" : "text-white"
              )}
            >
              {minerDisplay.name}
            </div>
            <div className="text-[9px] text-gray-500">Current Miner</div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-1.5 text-center">
          {/* Time */}
          <div>
            <div className="text-[8px] text-gray-500 uppercase">Time</div>
            <div className="text-xs font-semibold text-white">
              {formatTime(glazeElapsedSeconds)}
            </div>
          </div>

          {/* Mined */}
          <div>
            <div className="text-[8px] text-gray-500 uppercase">Mined</div>
            <div className="text-xs font-semibold text-white">
              ${glazedUsd.toFixed(2)}
            </div>
          </div>

          {/* PNL */}
          <div>
            <div className="text-[8px] text-gray-500 uppercase">PNL</div>
            <div className="text-xs font-semibold text-white">
              {pnlPositive ? "+" : "-"}${pnlUsd.toFixed(2)}
            </div>
          </div>

          {/* Total */}
          <div>
            <div className="text-[8px] text-gray-500 uppercase">Total</div>
            <div className="text-xs font-semibold text-white">
              {totalUsd >= 0 ? "+" : "-"}${Math.abs(totalUsd).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Rate + Price Row */}
        <div className="flex justify-between mt-2 pt-2 border-t border-zinc-800/50">
          <div>
            <span className="text-[9px] text-gray-500">Rate: </span>
            <span className="text-xs text-white font-medium">
              ${rateUsd.toFixed(4)}/s
            </span>
          </div>
          <div>
            <span className="text-[9px] text-gray-500">Price: </span>
            <span className="text-xs text-pink-500 font-medium">
              ${priceUsd.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
}
