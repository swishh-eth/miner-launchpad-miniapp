"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther, parseEther } from "viem";
import { useReadContract } from "wagmi";
import { ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";

import { NavBar } from "@/components/nav-bar";
import { Header } from "@/components/header";
import { Button } from "@/components/ui/button";
import {
  CONTRACT_ADDRESSES,
  ERC20_ABI,
  CORE_ABI,
  AUCTION_ABI,
} from "@/lib/contracts";
import { cn, getDonutPrice } from "@/lib/utils";
import { useFarcaster } from "@/hooks/useFarcaster";
import { useBatchedTransaction, encodeApproveCall, type Call } from "@/hooks/useBatchedTransaction";
import {
  DEFAULT_CHAIN_ID,
  DEFAULT_DONUT_PRICE_USD,
  PRICE_REFETCH_INTERVAL_MS,
  STALE_TIME_SHORT_MS,
} from "@/lib/constants";
import { getRigs, type SubgraphRig } from "@/lib/subgraph-launchpad";

type AuctionItem = {
  rig: SubgraphRig;
  lpTokenAddress: string;
  lpBalance: bigint;
  currentBid: bigint;
};

function LoadingDots() {
  return (
    <span className="inline-flex ml-1">
      <span className="animate-bounce [animation-delay:0ms]">.</span>
      <span className="animate-bounce [animation-delay:150ms]">.</span>
      <span className="animate-bounce [animation-delay:300ms]">.</span>
    </span>
  );
}

export default function AuctionsPage() {
  const readyRef = useRef(false);
  const [mode, setMode] = useState<"buy" | "get">("buy");
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [bidAmount, setBidAmount] = useState("");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);

  const { address, isConnected, connect } = useFarcaster();

  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Fetch DONUT price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getDonutPrice();
      setDonutUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Fetch rigs with LP tokens
  const { data: rigs, isLoading: rigsLoading } = useQuery({
    queryKey: ["auctions-rigs"],
    queryFn: () => getRigs(50, 0, "revenue", "desc"),
    staleTime: STALE_TIME_SHORT_MS,
    refetchInterval: 30_000,
  });

  // Get DONUT token address
  const { data: donutTokenAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "donutToken",
    chainId: DEFAULT_CHAIN_ID,
  });

  // Get user's DONUT balance
  const { data: donutBalance } = useReadContract({
    address: donutTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: !!donutTokenAddress && !!address,
      refetchInterval: STALE_TIME_SHORT_MS,
    },
  });

  const userDonutBalance = donutBalance as bigint | undefined;

  const formatDonut = (value: bigint) => {
    const num = Number(formatEther(value));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <Header 
            title="AUCTIONS" 
            action={
              <button
                onClick={() => setMode(mode === "buy" ? "get" : "buy")}
                className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 transition-colors text-black text-xs font-semibold"
              >
                {mode === "buy" ? "GET" : "BUY"}
              </button>
            }
          />

          {/* Content */}
          <div className="flex-1 overflow-y-auto scrollbar-hide pb-32">
            {rigsLoading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-20 rounded-xl bg-zinc-900 animate-pulse"
                  />
                ))}
              </div>
            ) : !rigs || rigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-gray-500">
                <p className="text-lg font-semibold">No auctions available</p>
                <p className="text-sm mt-1">Check back later</p>
              </div>
            ) : (
              <div className="space-y-2">
                {rigs.map((rig) => (
                  <div
                    key={rig.id}
                    className="p-3 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
                    onClick={() => {
                      // Handle auction selection
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white">
                          {rig.tokenName}
                        </div>
                        <div className="text-sm text-zinc-500">
                          {rig.tokenSymbol}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-purple-500 font-semibold">
                          {formatDonut(BigInt(rig.revenue))} DONUT
                        </div>
                        <div className="text-xs text-zinc-500">
                          Total revenue
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}