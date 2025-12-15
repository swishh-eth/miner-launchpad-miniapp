"use client";

import { useEffect, useRef } from "react";
import { MineMessageComponent } from "./mine-message";
import type { MineMessage } from "@/hooks/useMineHistory";

type MineChatProps = {
  mines: MineMessage[];
  isLoading: boolean;
  currentUserAddress?: `0x${string}`;
  ethUsdPrice?: number;
};

export function MineChat({
  mines,
  isLoading,
  currentUserAddress,
  ethUsdPrice = 3500,
}: MineChatProps) {
  const containerRef = useRef<HTMLDivElement>(null);
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
  }, [isLoading]);

  if (isLoading && mines.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-hide bg-zinc-950/50"
      />
    );
  }

  if (mines.length === 0) {
    return (
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto scrollbar-hide bg-zinc-950/50 flex items-center justify-center"
      >
        <div className="text-center text-gray-500 p-4">
          <p className="text-lg font-semibold">No mines yet</p>
          <p className="text-sm mt-1">Be the first to mine this rig!</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto scrollbar-hide bg-zinc-950/50"
    >
      <div className="divide-y divide-zinc-800/30">
        {mines.map((mine) => (
          <MineMessageComponent
            key={mine.id}
            mine={mine}
            isCurrentUser={
              currentUserAddress?.toLowerCase() === mine.miner.toLowerCase()
            }
            ethUsdPrice={ethUsdPrice}
          />
        ))}
      </div>
      <div ref={bottomRef} />
    </div>
  );
}
