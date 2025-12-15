"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MineMessage } from "@/hooks/useMineHistory";

type MineMessageProps = {
  mine: MineMessage;
  isCurrentUser?: boolean;
  ethUsdPrice?: number;
};

function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function MineMessageComponent({
  mine,
  isCurrentUser = false,
  ethUsdPrice = 3500,
}: MineMessageProps) {
  // Fetch user profile from Neynar
  const { data: neynarUser } = useQuery<{
    user: {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null;
  }>({
    queryKey: ["neynar-user", mine.miner],
    queryFn: async () => {
      const res = await fetch(
        `/api/neynar/user?address=${encodeURIComponent(mine.miner)}`
      );
      if (!res.ok) return { user: null };
      return res.json();
    },
    staleTime: 60_000,
    retry: false,
  });

  const displayName = useMemo(() => {
    if (neynarUser?.user?.displayName) return neynarUser.user.displayName;
    if (neynarUser?.user?.username) return `@${neynarUser.user.username}`;
    return formatAddress(mine.miner);
  }, [neynarUser, mine.miner]);

  const username = useMemo(() => {
    if (neynarUser?.user?.username) return `@${neynarUser.user.username}`;
    return null;
  }, [neynarUser]);

  const avatarUrl = useMemo(() => {
    if (neynarUser?.user?.pfpUrl) return neynarUser.user.pfpUrl;
    return `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
      mine.miner.toLowerCase()
    )}`;
  }, [neynarUser, mine.miner]);

  const priceEth = Number(formatEther(mine.price));
  const priceUsd = priceEth * ethUsdPrice;

  const messageText = mine.uri.trim() || "Mined!";

  return (
    <div
      className={cn(
        "flex gap-2 px-2 py-1.5",
        isCurrentUser && "bg-pink-500/5"
      )}
    >
      {/* Avatar */}
      <Avatar className="h-8 w-8 flex-shrink-0 ring-1 ring-zinc-800">
        <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
        <AvatarFallback className="bg-zinc-800 text-white text-[10px] uppercase">
          {mine.miner.slice(-2)}
        </AvatarFallback>
      </Avatar>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header: Name + Time */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-xs font-semibold truncate",
              isCurrentUser ? "text-pink-500" : "text-white"
            )}
          >
            {displayName}
          </span>
          {username && displayName !== username && (
            <span className="text-[10px] text-gray-500 truncate">
              {username}
            </span>
          )}
          <span className="text-[10px] text-gray-600 flex-shrink-0">
            {formatTimeAgo(mine.timestamp)}
          </span>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-300 break-words">{messageText}</p>

        {/* Price Badge */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-pink-500 font-medium">
            {priceEth.toFixed(5)} ETH
          </span>
          <span className="text-[10px] text-gray-500">
            ${priceUsd.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}
