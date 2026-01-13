"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Copy, Check, Share2, Home, Pickaxe, ChevronDown, MessageSquare } from "lucide-react";
import Link from "next/link";
import {
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { formatEther, formatUnits, parseUnits, type Address, zeroAddress } from "viem";

import { LazyPriceChart } from "@/components/lazy-price-chart";
import type { HoverData } from "@/components/price-chart";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MineHistoryItem } from "@/components/mine-history-item";
import { TokenStats } from "@/components/token-stats";
import { useRigState, useRigInfo } from "@/hooks/useRigState";
import { useUserRigStats } from "@/hooks/useUserRigStats";
import { usePriceHistory, type Timeframe } from "@/hooks/usePriceHistory";
import { useDexScreener } from "@/hooks/useDexScreener";
import { useMineHistory } from "@/hooks/useMineHistory";
import { useFarcaster, shareMiningAchievement, viewProfile } from "@/hooks/useFarcaster";
import { useFriendActivity, getFriendActivityMessage } from "@/hooks/useFriendActivity";
import { useRigLeaderboard } from "@/hooks/useRigLeaderboard";
import { Leaderboard } from "@/components/leaderboard";
import { usePrices } from "@/hooks/usePrices";
import { useTokenMetadata } from "@/hooks/useMetadata";
import { useProfile } from "@/hooks/useBatchProfiles";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, ERC20_ABI } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import {
  DEFAULT_CHAIN_ID,
  DEADLINE_BUFFER_SECONDS,
  TOKEN_DECIMALS,
} from "@/lib/constants";

const formatUsd = (value: number, compact = false) => {
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-bounce-dot-1">.</span>
      <span className="animate-bounce-dot-2">.</span>
      <span className="animate-bounce-dot-3">.</span>
    </span>
  );
}

export default function RigDetailPage() {
  const params = useParams();
  const rigAddress = params.address as `0x${string}`;

  const [customMessage, setCustomMessage] = useState("");
  const [mineResult, setMineResult] = useState<"success" | "failure" | null>(null);

  const { ethUsdPrice, donutUsdPrice } = usePrices();
  const mineResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>("1D");
  const [chartHover, setChartHover] = useState<HoverData>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [chartExpanded, setChartExpanded] = useState(false);
  const [minePriceInUsd, setMinePriceInUsd] = useState(false);
  const [showMessageInput, setShowMessageInput] = useState(false);
  const [lastMineDetails, setLastMineDetails] = useState<{
    priceSpent: string;
    message: string;
  } | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);

  const { address, isConnected, connect, user: farcasterUser } = useFarcaster();

  const { rigState, refetch: refetchRigState } = useRigState(rigAddress, address);
  const { rigInfo } = useRigInfo(rigAddress);
  const { stats: userStats } = useUserRigStats(address, rigAddress);

  const { priceHistory, isLoading: isLoadingPrice, timeframeSeconds, tokenFirstActiveTime } = usePriceHistory(rigAddress, selectedTimeframe, ethUsdPrice);

  const { pairData, lpAddress } = useDexScreener(rigAddress, rigInfo?.unitAddress);
  const { mines: mineHistory } = useMineHistory(rigAddress, 10);

  const minerAddresses = useMemo(() => {
    const uniqueAddrs = new Set<string>();
    mineHistory.forEach(mine => uniqueAddrs.add(mine.miner));
    if (rigState?.miner && rigState.miner !== "0x0000000000000000000000000000000000000000") {
      uniqueAddrs.add(rigState.miner);
    }
    return Array.from(uniqueAddrs);
  }, [mineHistory, rigState?.miner]);

  const { data: friendActivity } = useFriendActivity(minerAddresses, farcasterUser?.fid);
  const friendActivityMessage = friendActivity?.friends ? getFriendActivityMessage(friendActivity.friends) : null;

  const friendFids = useMemo(() => {
    if (!friendActivity?.friends) return new Set<number>();
    return new Set(friendActivity.friends.map(f => f.fid));
  }, [friendActivity?.friends]);

  const { entries: leaderboardEntries, userRank, isLoading: isLoadingLeaderboard } = useRigLeaderboard(
    rigAddress,
    address,
    friendFids,
    10
  );

  const { metadata: tokenMetadata, logoUrl: tokenLogoUrl } = useTokenMetadata(rigState?.rigUri);

  const { data: totalSupplyRaw } = useReadContract({
    address: rigInfo?.unitAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: !!rigInfo?.unitAddress,
    },
  });

  const { data: txHash, writeContract, isPending: isWriting, reset: resetWrite } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash, chainId: DEFAULT_CHAIN_ID });

  const { data: ethBalanceData, refetch: refetchEthBalance } = useBalance({
    address,
    chainId: DEFAULT_CHAIN_ID,
  });

  const { data: unitBalanceData, refetch: refetchUnitBalance } = useBalance({
    address,
    token: rigInfo?.unitAddress as Address,
    chainId: DEFAULT_CHAIN_ID,
    query: { enabled: !!rigInfo?.unitAddress },
  });

  const refetchBalances = useCallback(() => {
    refetchEthBalance();
    refetchUnitBalance();
  }, [refetchEthBalance, refetchUnitBalance]);

  const resetMineResult = useCallback(() => {
    if (mineResultTimeoutRef.current) {
      clearTimeout(mineResultTimeoutRef.current);
      mineResultTimeoutRef.current = null;
    }
    setMineResult(null);
  }, []);

  const showMineResult = useCallback((result: "success" | "failure") => {
    if (mineResultTimeoutRef.current) clearTimeout(mineResultTimeoutRef.current);
    setMineResult(result);
    mineResultTimeoutRef.current = setTimeout(() => {
      setMineResult(null);
      mineResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  useEffect(() => {
    return () => {
      if (mineResultTimeoutRef.current) clearTimeout(mineResultTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!receipt) return;
    if (receipt.status === "success" || receipt.status === "reverted") {
      showMineResult(receipt.status === "success" ? "success" : "failure");
      refetchRigState();
      if (receipt.status === "success") setCustomMessage("");
      const resetTimer = setTimeout(() => resetWrite(), 500);
      return () => clearTimeout(resetTimer);
    }
  }, [receipt, refetchRigState, resetWrite, showMineResult]);

  const [interpolatedGlazed, setInterpolatedGlazed] = useState<bigint | null>(null);
  const [glazeElapsedSeconds, setGlazeElapsedSeconds] = useState<number>(0);

  useEffect(() => {
    if (!rigState) {
      setInterpolatedGlazed(null);
      return;
    }
    setInterpolatedGlazed(rigState.glazed);
    const interval = setInterval(() => {
      if (rigState.nextUps > 0n) {
        setInterpolatedGlazed((prev) => (prev ? prev + rigState.nextUps : rigState.glazed));
      }
    }, 1_000);
    return () => clearInterval(interval);
  }, [rigState]);

  useEffect(() => {
    if (!rigState) {
      setGlazeElapsedSeconds(0);
      return;
    }
    const startTimeSeconds = Number(rigState.epochStartTime);
    const initialElapsed = Math.floor(Date.now() / 1000) - startTimeSeconds;
    setGlazeElapsedSeconds(initialElapsed);
    const interval = setInterval(() => {
      setGlazeElapsedSeconds(Math.floor(Date.now() / 1000) - startTimeSeconds);
    }, 1_000);
    return () => clearInterval(interval);
  }, [rigState]);

  const handleMine = useCallback(async () => {
    if (!rigState) return;
    resetMineResult();
    try {
      let targetAddress = address;
      if (!targetAddress) {
        targetAddress = await connect();
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address.");

      const price = rigState.price;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;
      const messageToSend = customMessage.trim() || tokenMetadata?.defaultMessage || "gm";

      setLastMineDetails({
        priceSpent: Number(formatEther(price)).toFixed(6),
        message: messageToSend,
      });

      await writeContract({
        account: targetAddress as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "mine",
        args: [rigAddress, rigState.epochId, deadline, maxPrice, messageToSend],
        value: price,
        chainId: DEFAULT_CHAIN_ID,
      });
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      setLastMineDetails(null);
      resetWrite();
    }
  }, [address, connect, customMessage, rigState, rigAddress, resetMineResult, resetWrite, showMineResult, writeContract, tokenMetadata]);

  const handleShareMine = useCallback(async () => {
    if (!rigInfo) return;

    const rigUrl = `${window.location.origin}/rig/${rigAddress}`;

    const currentGlazed = interpolatedGlazed ?? rigState?.glazed ?? 0n;
    const minedAmount = currentGlazed > 0n
      ? Number(formatUnits(currentGlazed, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })
      : rigState?.nextUps
        ? Number(formatUnits(rigState.nextUps * 60n, TOKEN_DECIMALS)).toFixed(0)
        : "some";

    await shareMiningAchievement({
      tokenSymbol: rigInfo.tokenSymbol || "TOKEN",
      tokenName: rigInfo.tokenName || "this token",
      amountMined: minedAmount,
      rigUrl,
      message: customMessage && customMessage !== "gm" ? customMessage : undefined,
    });
  }, [rigInfo, rigAddress, rigState?.glazed, rigState?.nextUps, interpolatedGlazed, customMessage]);

  const buttonLabel = useMemo(() => {
    if (!rigState) return "LOADING...";
    if (mineResult === "success") return "MINED!";
    if (mineResult === "failure") return "FAILED";
    if (isWriting || isConfirming) return <>MINING<LoadingDots /></>;
    return "MINE";
  }, [mineResult, isConfirming, isWriting, rigState]);

  const isMineDisabled = !rigState || isWriting || isConfirming || mineResult !== null;
  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? "Loading...";

  const glazedAmount = interpolatedGlazed ?? rigState?.glazed ?? 0n;
  const unitPrice = rigState?.unitPrice ?? 0n;
  const glazedUsd = unitPrice > 0n
    ? Number(formatUnits(glazedAmount, TOKEN_DECIMALS)) * Number(formatEther(unitPrice)) * donutUsdPrice
    : 0;
  const rateUsd = unitPrice > 0n
    ? Number(formatUnits(rigState?.nextUps ?? 0n, TOKEN_DECIMALS)) * Number(formatEther(unitPrice)) * donutUsdPrice
    : 0;
  const priceUsd = rigState ? Number(formatEther(rigState.price)) * ethUsdPrice : 0;
  const priceEth = rigState ? Number(formatEther(rigState.price)) : 0;
  const tokenPriceUsd = unitPrice > 0n ? Number(formatEther(unitPrice)) * donutUsdPrice : 0;

  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw as bigint, TOKEN_DECIMALS)) : 0;
  const dexPriceUsd = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
  const displayPriceUsd = dexPriceUsd ?? tokenPriceUsd;
  const marketCap = pairData?.marketCap ?? (totalSupply * displayPriceUsd);
  const liquidity = pairData?.liquidity?.usd ?? 0;
  const volume24h = pairData?.volume?.h24 ?? 0;

  const unitBalance = rigState?.unitBalance ? Number(formatUnits(rigState.unitBalance, TOKEN_DECIMALS)) : 0;
  const unitBalanceUsd = unitPrice > 0n ? unitBalance * Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const ethBalance = rigState?.ethBalance ? Number(formatEther(rigState.ethBalance)) : 0;

  const totalMined = userStats?.totalMined ? Number(formatUnits(userStats.totalMined, TOKEN_DECIMALS)) : 0;
  const totalMinedUsd = unitPrice > 0n ? totalMined * Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const totalSpent = userStats?.totalSpent ? Number(formatEther(userStats.totalSpent)) : 0;
  const totalSpentUsd = totalSpent * ethUsdPrice;
  const totalEarned = userStats?.totalEarned ? Number(formatEther(userStats.totalEarned)) : 0;
  const totalEarnedUsd = totalEarned * ethUsdPrice;

  const minerAddress = rigState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;
  const isCurrentUserMiner = address && minerAddress.toLowerCase() === address.toLowerCase();

  const {
    displayName: minerDisplayName,
    avatarUrl: minerAvatarUrl,
    fid: minerFid,
  } = useProfile(hasMiner ? minerAddress : undefined);

  const launcherAddress = rigInfo?.launcher ?? zeroAddress;
  const hasLauncher = launcherAddress !== zeroAddress;
  const {
    displayName: launcherDisplayName,
    avatarUrl: launcherAvatarUrl,
    fid: launcherFid,
  } = useProfile(hasLauncher ? launcherAddress : undefined);

  const formatTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const timeAgo = (timestamp: number): string => {
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return `${Math.floor(diff / 604800)}w ago`;
  };

  const handleCopyAddress = useCallback(async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr);
      setCopiedAddress(addr);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  const chartData = priceHistory;

  const isPageLoading = !rigInfo || !rigState;

  // Helper function to get link label
  const getLinkLabel = (link: string): string => {
    const url = link.startsWith("http") ? link : `https://${link}`;
    try {
      const hostname = new URL(url).hostname.replace("www.", "");
      if (hostname.includes("twitter") || hostname.includes("x.com")) return "Twitter";
      if (hostname.includes("telegram") || hostname.includes("t.me")) return "Telegram";
      if (hostname.includes("discord")) return "Discord";
      if (hostname.includes("github")) return "GitHub";
      return hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1);
    } catch {
      return "Link";
    }
  };

  if (isPageLoading) {
    return (
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div
          className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
          style={{
            paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
          }}
        />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
        }}
      >
        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Token Info + Price */}
          <div className="px-3 flex gap-3 items-start">
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center flex-shrink-0">
              {tokenLogoUrl ? (
                <img src={tokenLogoUrl} alt={tokenSymbol} className="w-14 h-14 object-cover rounded-xl" />
              ) : (
                <span className="text-lg font-bold text-purple-500">{tokenSymbol.slice(0, 2)}</span>
              )}
            </div>
            <div className="flex-1">
              <div className="text-xs text-zinc-500 font-medium">{tokenSymbol}</div>
              <h1 className="text-xl font-bold">{tokenName}</h1>
              <div ref={priceRef} className="mt-0.5">
                <span className="text-2xl font-bold">${displayPriceUsd.toFixed(6)}</span>
              </div>
            </div>
          </div>

          {/* Current Miner - Centered */}
          {hasMiner && (
            <div className="mt-6 px-3">
              <div className="flex flex-col items-center">
                <button
                  onClick={() => minerFid && viewProfile(minerFid)}
                  disabled={!minerFid}
                  className={minerFid ? "cursor-pointer" : "cursor-default"}
                >
                  <Avatar className="h-16 w-16 ring-2 ring-purple-500/50">
                    <AvatarImage src={minerAvatarUrl} alt={minerDisplayName} />
                    <AvatarFallback className="bg-zinc-800 text-white text-lg">
                      {minerAddress.slice(-2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <button
                  onClick={() => minerFid && viewProfile(minerFid)}
                  disabled={!minerFid}
                  className={`mt-2 text-center ${minerFid ? "cursor-pointer" : "cursor-default"}`}
                >
                  <div className={`text-sm font-semibold text-white ${minerFid ? "hover:text-purple-400" : ""}`}>
                    {minerDisplayName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Mining for {formatTime(glazeElapsedSeconds)}
                  </div>
                </button>
                {isCurrentUserMiner && (
                  <button
                    onClick={handleShareMine}
                    className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 transition-colors text-xs text-purple-400"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    Cast
                  </button>
                )}
              </div>
              
              {/* Miner Stats Grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-4 bg-zinc-900/50 rounded-xl p-4">
                <div className="text-center">
                  <div className="text-xs text-zinc-500">Mine rate</div>
                  <div className="text-sm font-semibold">
                    {Number(formatUnits(rigState?.nextUps ?? 0n, TOKEN_DECIMALS)).toFixed(2)}/s
                  </div>
                  <div className="text-[10px] text-zinc-600">${rateUsd.toFixed(4)}/s</div>
                </div>
                <div className="text-center">
                  <div className="text-xs text-zinc-500">Mined</div>
                  <div className="flex items-center justify-center gap-1 text-sm font-semibold">
                    <span>+</span>
                    {tokenLogoUrl ? (
                      <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center text-[8px] text-black font-bold">
                        {tokenSymbol.slice(0, 2)}
                      </span>
                    )}
                    <span>{Number(formatUnits(glazedAmount, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{formatUsd(glazedUsd)}</div>
                </div>
              </div>
            </div>
          )}

          {/* About */}
          <div className="px-3 mt-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold">About</h2>
              <button
                onClick={async () => {
                  const rigUrl = `${window.location.origin}/rig/${rigAddress}`;
                  try {
                    await navigator.clipboard.writeText(rigUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  } catch {
                    const textArea = document.createElement("textarea");
                    textArea.value = rigUrl;
                    textArea.style.position = "fixed";
                    textArea.style.left = "-9999px";
                    document.body.appendChild(textArea);
                    textArea.select();
                    document.execCommand("copy");
                    document.body.removeChild(textArea);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }
                }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs text-zinc-400"
              >
                {copiedLink ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
                {copiedLink ? "Copied" : "Share"}
              </button>
            </div>
            {hasLauncher && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm text-zinc-500">Deployed by</span>
                <button
                  onClick={() => launcherFid && viewProfile(launcherFid)}
                  disabled={!launcherFid}
                  className={`flex items-center gap-2 ${launcherFid ? "cursor-pointer" : "cursor-default"}`}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={launcherAvatarUrl} alt={launcherDisplayName} />
                    <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                      {launcherAddress.slice(2, 4).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`text-sm font-medium text-white ${launcherFid ? "hover:text-purple-400" : ""}`}>
                    {launcherDisplayName}
                  </span>
                </button>
              </div>
            )}
            <p className="text-sm text-zinc-400 mb-3">
              {tokenMetadata?.description || `${tokenName} is a token launched on the Miner Launchpad.`}
            </p>

            {/* Links */}
            <div className="flex flex-wrap gap-2">
              {tokenMetadata?.links && tokenMetadata.links.length > 0 ? (
                tokenMetadata.links.map((link: string, index: number) => {
                  const url = link.startsWith("http") ? link : `https://${link}`;
                  const label = getLinkLabel(link);
                  return (
                    <a
                      key={index}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                      {label}
                    </a>
                  );
                })
              ) : (
                <>
                  {tokenMetadata?.website && (
                    <a
                      href={tokenMetadata.website.startsWith("http") ? tokenMetadata.website : `https://${tokenMetadata.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                      Website
                    </a>
                  )}
                  {tokenMetadata?.twitter && (
                    <a
                      href={`https://x.com/${tokenMetadata.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                      Twitter
                    </a>
                  )}
                  {tokenMetadata?.telegram && (
                    <a
                      href={`https://t.me/${tokenMetadata.telegram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                      Telegram
                    </a>
                  )}
                  {tokenMetadata?.discord && (
                    <a
                      href={tokenMetadata.discord.startsWith("http") ? tokenMetadata.discord : `https://discord.gg/${tokenMetadata.discord}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    >
                      Discord
                    </a>
                  )}
                </>
              )}
              {rigInfo?.unitAddress && (
                <button
                  onClick={() => handleCopyAddress(rigInfo.unitAddress)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <span>{tokenSymbol}</span>
                  {copiedAddress === rigInfo.unitAddress ? (
                    <Check className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
              {lpAddress && (
                <button
                  onClick={() => handleCopyAddress(lpAddress)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <span>{tokenSymbol}-DONUT LP</span>
                  {copiedAddress === lpAddress ? (
                    <Check className="w-3 h-3 text-purple-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <TokenStats
            marketCap={marketCap}
            totalSupply={totalSupply}
            liquidity={liquidity}
            volume24h={volume24h}
          />

          {/* Mining Cost Chart - Collapsible */}
          <div className="mt-4 px-3">
            <button 
              onClick={() => setChartExpanded(!chartExpanded)}
              className="w-full flex items-center justify-between py-2 hover:bg-zinc-900/30 transition-colors rounded-lg"
            >
              <span className="text-xs text-zinc-500">Mine Cost</span>
              <div className="flex items-center gap-2">
                {(() => {
                  const displayData = chartHover ?? (chartData.length > 0 ? chartData[chartData.length - 1] : null);
                  if (!displayData) {
                    return <span className="text-xs text-zinc-600">--</span>;
                  }
                  return (
                    <span className="text-xs text-white font-medium">
                      ${displayData.value.toFixed(4)}
                    </span>
                  );
                })()}
                <ChevronDown className={cn(
                  "w-4 h-4 text-zinc-500 transition-transform",
                  chartExpanded && "rotate-180"
                )} />
              </div>
            </button>
            
            {chartExpanded && (
              <>
                <LazyPriceChart data={chartData} isLoading={isLoadingPrice} height={160} onHover={setChartHover} timeframeSeconds={timeframeSeconds} tokenFirstActiveTime={tokenFirstActiveTime} />
                
                {/* Timeframe Tabs */}
                <div className="flex justify-between mt-2">
                  {(["1D", "1W", "1M", "ALL"] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setSelectedTimeframe(tf)}
                      className={cn(
                        "flex-1 py-2 text-xs font-medium transition-colors",
                        selectedTimeframe === tf
                          ? "text-purple-500"
                          : "text-zinc-600 hover:text-zinc-400"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Leaderboard */}
          <Leaderboard
            entries={leaderboardEntries}
            userRank={userRank}
            tokenSymbol={tokenSymbol}
            tokenName={tokenName}
            rigUrl={`${typeof window !== 'undefined' ? window.location.origin : ''}/rig/${rigAddress}`}
            isLoading={isLoadingLeaderboard}
          />

          {/* Friend Activity Banner */}
          {friendActivityMessage && friendActivity?.friends && friendActivity.friends.length > 0 && (
            <div className="px-3 mt-6">
              <div className="flex items-center gap-2 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                <div className="flex -space-x-2">
                  {friendActivity.friends.slice(0, 3).map((friend) => (
                    <button
                      key={friend.fid}
                      onClick={() => viewProfile(friend.fid)}
                      className="cursor-pointer"
                    >
                      <Avatar className="h-6 w-6 border-2 border-black">
                        <AvatarImage
                          src={friend.pfpUrl ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${friend.fid}`}
                          alt={friend.displayName || friend.username || "Friend"}
                        />
                        <AvatarFallback className="bg-zinc-800 text-white text-[8px]">
                          {(friend.displayName || friend.username || "?").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    </button>
                  ))}
                </div>
                <span className="text-sm text-purple-300">{friendActivityMessage}</span>
              </div>
            </div>
          )}

          {/* Recent Mines */}
          <div className="px-3 mt-6">
            <h2 className="text-base font-bold mb-3">Recent mines</h2>
            <div className="space-y-2">
              {mineHistory.length === 0 ? (
                <div className="text-sm text-zinc-500">No mines yet</div>
              ) : (
                [...mineHistory].reverse().map((mine) => (
                  <MineHistoryItem key={mine.id} mine={mine} timeAgo={timeAgo} />
                ))
              )}
            </div>
          </div>

          {/* Spacer for floating buttons */}
          <div className="h-32" />
        </div>

        {/* Floating Action Buttons */}
        <div 
          className="fixed right-3 flex items-end gap-2"
          style={{
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          {/* Mine Controls */}
          <div className="flex items-center">
            {/* Price Pill + Message + Mine Button Row */}
            <div className="flex items-center">
              {/* Price Pill */}
              <button
                onClick={() => setMinePriceInUsd(!minePriceInUsd)}
                className="bg-zinc-900 border border-zinc-700 rounded-l-full pl-4 pr-3 py-2 flex items-center gap-2"
              >
                <div>
                  <div className="text-[10px] text-zinc-500 leading-tight">Mine price</div>
                  <div className="text-sm font-semibold text-white leading-tight">
                    {minePriceInUsd ? formatUsd(priceUsd) : `Ξ${priceEth.toFixed(6)}`}
                  </div>
                </div>
              </button>

              {/* Message Button */}
              <button
                onClick={() => setShowMessageInput(!showMessageInput)}
                className={cn(
                  "bg-zinc-900 border-y border-zinc-700 px-3 py-3 transition-colors",
                  showMessageInput ? "bg-zinc-800" : "hover:bg-zinc-800",
                  customMessage && "text-purple-400"
                )}
              >
                <MessageSquare className="w-5 h-5" />
              </button>
              
              {/* Pickaxe Button */}
              <button
                onClick={handleMine}
                disabled={isMineDisabled}
                className={cn(
                  "w-12 h-12 rounded-r-full flex items-center justify-center transition-all",
                  mineResult === "success"
                    ? "bg-green-500"
                    : mineResult === "failure"
                    ? "bg-zinc-700"
                    : "bg-purple-500 hover:bg-purple-600 active:scale-95",
                  isMineDisabled && !mineResult && "opacity-50"
                )}
              >
                {mineResult === "success" ? (
                  <Check className="w-5 h-5 text-white" />
                ) : isWriting || isConfirming ? (
                  <span className="inline-flex items-center gap-0.5 text-white text-sm">
                    <span className="animate-bounce-dot-1">•</span>
                    <span className="animate-bounce-dot-2">•</span>
                    <span className="animate-bounce-dot-3">•</span>
                  </span>
                ) : (
                  <Pickaxe className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
          </div>

          {/* Home Button */}
          <Link
            href="/explore"
            className="w-12 h-12 rounded-full bg-purple-500 hover:bg-purple-600 flex items-center justify-center shadow-lg transition-all active:scale-95"
          >
            <Home className="w-5 h-5 text-white" />
          </Link>
        </div>

        {/* Message Input Popover */}
        {showMessageInput && (
          <div 
            className="fixed right-3 bg-zinc-900 border border-zinc-700 rounded-xl p-3 shadow-xl"
            style={{
              bottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
              width: "calc(100% - 24px)",
              maxWidth: "496px",
            }}
          >
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Add a message to your mine..."
              maxLength={100}
              autoFocus
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-zinc-500">{customMessage.length}/100</span>
              <button
                onClick={() => setShowMessageInput(false)}
                className="text-xs text-purple-400 hover:text-purple-300"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}