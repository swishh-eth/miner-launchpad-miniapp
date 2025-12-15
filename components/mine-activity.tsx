"use client";

import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { MineMessage } from "@/hooks/useMineHistory";

type MineActivityProps = {
  mines: MineMessage[];
  isLoading: boolean;
  currentUserAddress?: `0x${string}`;
  ethUsdPrice?: number;
};

function ActivityItem({
  mine,
  isCurrentUser,
  ethUsdPrice,
}: {
  mine: MineMessage;
  isCurrentUser: boolean;
  ethUsdPrice: number;
}) {
  const priceUsd = Number(formatEther(mine.price)) * ethUsdPrice;

  // Fetch user profile
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

  const profile = neynarUser?.user;
  const displayName =
    profile?.displayName ??
    profile?.username ??
    `${mine.miner.slice(0, 6)}...${mine.miner.slice(-4)}`;
  const avatarUrl =
    profile?.pfpUrl ??
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(
      mine.miner.toLowerCase()
    )}`;

  const timeAgo = useMemo(() => {
    const seconds = Math.floor(Date.now() / 1000) - mine.timestamp;
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
  }, [mine.timestamp]);

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3",
        isCurrentUser && "bg-pink-500/5"
      )}
    >
      <Avatar className="h-10 w-10 flex-shrink-0">
        <AvatarImage src={avatarUrl} alt={displayName} />
        <AvatarFallback className="bg-zinc-800 text-white text-xs">
          {mine.miner.slice(-2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-semibold text-sm truncate",
              isCurrentUser ? "text-pink-500" : "text-white"
            )}
          >
            {displayName}
          </span>
          <span className="text-xs text-zinc-600">{timeAgo}</span>
        </div>
        {mine.uri && (
          <p className="text-sm text-zinc-400 mt-0.5 break-words">{mine.uri}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-pink-500 font-medium">
            ${priceUsd.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MineActivity({
  mines,
  isLoading,
  currentUserAddress,
  ethUsdPrice = 3500,
}: MineActivityProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevMinesLengthRef = useRef(mines.length);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (mines.length > prevMinesLengthRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMinesLengthRef.current = mines.length;
  }, [mines.length]);

  // Scroll to bottom on initial load
  useEffect(() => {
    if (mines.length > 0 && !isLoading) {
      bottomRef.current?.scrollIntoView();
    }
  }, [isLoading, mines.length]);

  if (isLoading && mines.length === 0) {
    return null;
  }

  if (mines.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center py-12">
        <div className="text-center">
          <div className="text-4xl mb-3">⛏️</div>
          <p className="text-lg font-semibold text-white">No activity yet</p>
          <p className="text-sm text-zinc-500 mt-1">Be the first to mine!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="divide-y divide-zinc-900/50">
      {mines.map((mine) => (
        <ActivityItem
          key={mine.id}
          mine={mine}
          isCurrentUser={
            currentUserAddress?.toLowerCase() === mine.miner.toLowerCase()
          }
          ethUsdPrice={ethUsdPrice}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
