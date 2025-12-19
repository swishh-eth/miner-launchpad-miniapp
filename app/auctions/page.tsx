"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame } from "lucide-react";
import { formatEther, type Address } from "viem";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { useAllRigAddresses } from "@/hooks/useAllRigs";
import {
  useAllAuctionStates,
  type AuctionListItem,
} from "@/hooks/useAuctionState";
import { useRigInfo, useRigState } from "@/hooks/useRigState";
import { useFarcaster, getUserDisplayName, getUserHandle, initialsFrom } from "@/hooks/useFarcaster";
import {
  useBatchedTransaction,
  encodeApproveCall,
  encodeContractCall,
} from "@/hooks/useBatchedTransaction";
import { CONTRACT_ADDRESSES, MULTICALL_ABI } from "@/lib/contracts";
import { cn, getEthPrice, getDonutPrice } from "@/lib/utils";
import {
  DEFAULT_ETH_PRICE_USD,
  DEFAULT_DONUT_PRICE_USD,
  PRICE_REFETCH_INTERVAL_MS,
  ipfsToHttp,
} from "@/lib/constants";

const AUCTION_DEADLINE_BUFFER_SECONDS = 5 * 60;

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


// LP Pair icon component - shows two overlapping token icons
function LpPairIcon({
  rigUri,
  tokenSymbol,
  size = "md",
  className
}: {
  rigUri?: string;
  tokenSymbol?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch metadata to get image URL
  useEffect(() => {
    if (!rigUri) return;

    const metadataUrl = ipfsToHttp(rigUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToHttp(metadata.image));
        }
      })
      .catch(() => {
        // Silently fail - will show fallback
      });
  }, [rigUri]);

  const sizes = {
    sm: {
      unit: "w-4 h-4",
      fallbackText: "text-[8px]",
      donut: "w-3 h-3 -ml-1.5",
      donutHole: "w-1 h-1",
    },
    md: {
      unit: "w-6 h-6",
      fallbackText: "text-[10px]",
      donut: "w-5 h-5 -ml-2.5",
      donutHole: "w-1.5 h-1.5",
    },
  };

  const s = sizes[size];
  const fallbackLetter = tokenSymbol ? tokenSymbol.charAt(0).toUpperCase() : "?";

  return (
    <div className={cn("relative flex items-center isolate", className)}>
      {/* Unit token (left/front) */}
      <div className={cn(s.unit, "rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden z-[2]")}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Unit"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={cn(s.fallbackText, "font-bold text-purple-500")}>{fallbackLetter}</span>
        )}
      </div>
      {/* DONUT token (right/back) - donut shape, behind unit */}
      <div className={cn(s.donut, "rounded-full bg-purple-500 flex items-center justify-center z-[1]")}>
        <div className={cn(s.donutHole, "rounded-full bg-black")} />
      </div>
    </div>
  );
}


// WETH icon component - uses real ETH logo
function WethIcon({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center bg-[#627EEA] overflow-hidden",
        className
      )}
    >
      <svg viewBox="0 0 32 32" className="w-5 h-5" fill="none">
        <path d="M16 4L16 12.87L23 16.22L16 4Z" fill="white" fillOpacity="0.6"/>
        <path d="M16 4L9 16.22L16 12.87L16 4Z" fill="white"/>
        <path d="M16 21.97L16 28L23 17.62L16 21.97Z" fill="white" fillOpacity="0.6"/>
        <path d="M16 28L16 21.97L9 17.62L16 28Z" fill="white"/>
        <path d="M16 20.57L23 16.22L16 12.87L16 20.57Z" fill="white" fillOpacity="0.2"/>
        <path d="M9 16.22L16 20.57L16 12.87L9 16.22Z" fill="white" fillOpacity="0.6"/>
      </svg>
    </div>
  );
}

// Auction card component
function AuctionCard({
  auction,
  ethUsdPrice,
  donutUsdPrice,
  isSelected,
  onClick,
}: {
  auction: AuctionListItem;
  ethUsdPrice: number;
  donutUsdPrice: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const { rigInfo } = useRigInfo(auction.rigAddress);
  const { rigState } = useRigState(auction.rigAddress, undefined);

  // LP price is in DONUT value, convert to USD
  const lpPriceUsd =
    Number(formatEther(auction.auctionState.price)) *
    Number(formatEther(auction.auctionState.paymentTokenPrice)) *
    donutUsdPrice;
  const wethValueUsd =
    Number(formatEther(auction.auctionState.wethAccumulated)) * ethUsdPrice;

  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const rigUri = rigState?.rigUri;

  const isProfitable = wethValueUsd > lpPriceUsd;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl p-3 cursor-pointer transition-all bg-zinc-900 mb-1.5",
        isSelected
          ? "ring-2 ring-purple-500 shadow-[0_0_15px_rgba(160,111,255,0.3)]"
          : "ring-1 ring-zinc-800 hover:ring-zinc-700"
      )}
    >
      <div className="grid grid-cols-2 gap-3">
        {/* YOU PAY */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            YOU PAY
          </div>
          <div className="flex items-center gap-1.5 h-6">
            <LpPairIcon rigUri={rigUri} tokenSymbol={tokenSymbol} />
            <span className="text-sm font-bold text-purple-500">
              {formatEth(auction.auctionState.price, 4)}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            {tokenSymbol}-DONUT LP (~${lpPriceUsd.toFixed(2)})
          </div>
        </div>

        {/* YOU RECEIVE */}
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">
            YOU RECEIVE
          </div>
          <div className="flex items-center gap-1.5 h-6">
            <WethIcon className="w-5 h-5" />
            <span className="text-sm font-bold text-white">
              {formatEth(auction.auctionState.wethAccumulated, 4)}
            </span>
          </div>
          <div className="text-[10px] text-gray-500 mt-0.5">
            WETH (~${wethValueUsd.toFixed(2)})
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuctionsPage() {
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(DEFAULT_ETH_PRICE_USD);
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);
  const [selectedAuctionAddress, setSelectedAuctionAddress] = useState<`0x${string}` | null>(null);
  const [pendingAuction, setPendingAuction] = useState<AuctionListItem | null>(
    null
  );

  // Farcaster context and wallet connection
  const { user, address, isConnected, connect } = useFarcaster();

  // Batched transaction hook for approve + buy
  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Get all rig addresses
  const { addresses: rigAddresses } = useAllRigAddresses();

  // Get all auction states
  const { auctions, isLoading, refetch: refetchAuctions } = useAllAuctionStates(
    rigAddresses,
    address
  );

  // Sort auctions by profitability
  const sortedAuctions = useMemo(() => {
    return [...auctions].sort((a, b) => {
      // Calculate USD values for auction A
      const aLpUsd =
        Number(formatEther(a.auctionState.price)) *
        Number(formatEther(a.auctionState.paymentTokenPrice)) *
        donutUsdPrice;
      const aWethUsd =
        Number(formatEther(a.auctionState.wethAccumulated)) * ethUsdPrice;
      const aDiff = aWethUsd - aLpUsd;

      // Calculate USD values for auction B
      const bLpUsd =
        Number(formatEther(b.auctionState.price)) *
        Number(formatEther(b.auctionState.paymentTokenPrice)) *
        donutUsdPrice;
      const bWethUsd =
        Number(formatEther(b.auctionState.wethAccumulated)) * ethUsdPrice;
      const bDiff = bWethUsd - bLpUsd;

      // Both profitable (positive diff): higher diff is better
      if (aDiff > 0 && bDiff > 0) {
        return bDiff - aDiff;
      }
      // Both unprofitable (negative diff): smaller loss is better
      if (aDiff < 0 && bDiff < 0) {
        return bDiff - aDiff; // Less negative (smaller loss) comes first
      }
      // A is profitable, B is not: A comes first
      if (aDiff >= 0 && bDiff < 0) {
        return -1;
      }
      // B is profitable, A is not: B comes first
      if (bDiff >= 0 && aDiff < 0) {
        return 1;
      }
      // Both equal (diff = 0): they're equal
      return 0;
    });
  }, [auctions, ethUsdPrice, donutUsdPrice]);


  // Fetch ETH and DONUT prices
  useEffect(() => {
    const fetchPrices = async () => {
      const [ethPrice, donutPrice] = await Promise.all([
        getEthPrice(),
        getDonutPrice(),
      ]);
      setEthUsdPrice(ethPrice);
      setDonutUsdPrice(donutPrice);
    };
    fetchPrices();
    const interval = setInterval(fetchPrices, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Handle batch transaction completion
  useEffect(() => {
    if (batchState === "success") {
      setPendingAuction(null);
      refetchAuctions();
      resetBatch();
    } else if (batchState === "error") {
      setPendingAuction(null);
      resetBatch();
    }
  }, [batchState, refetchAuctions, resetBatch]);

  const handleBuy = useCallback(
    async (auction: AuctionListItem) => {
      if (!address) {
        try {
          await connect();
        } catch {
          return;
        }
      }

      setPendingAuction(auction);

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + AUCTION_DEADLINE_BUFFER_SECONDS
      );

      // Create batched calls: approve + buy
      const approveCall = encodeApproveCall(
        auction.auctionState.paymentToken,
        CONTRACT_ADDRESSES.multicall as Address,
        auction.auctionState.price
      );

      const buyCall = encodeContractCall(
        CONTRACT_ADDRESSES.multicall as Address,
        MULTICALL_ABI,
        "buy",
        [
          auction.rigAddress,
          auction.auctionState.epochId,
          deadline,
          auction.auctionState.price,
        ]
      );

      try {
        await executeBatch([approveCall, buyCall]);
      } catch (error) {
        console.error("Transaction failed:", error);
        setPendingAuction(null);
        resetBatch();
      }
    },
    [address, connect, executeBatch, resetBatch]
  );

  const userDisplayName = getUserDisplayName(user);
  const userHandle = getUserHandle(user);
  const userAvatarUrl = user?.pfpUrl ?? null;

  // Auto-select first auction if none selected
  useEffect(() => {
    if (sortedAuctions.length > 0 && !selectedAuctionAddress) {
      setSelectedAuctionAddress(sortedAuctions[0].rigAddress);
    }
  }, [sortedAuctions, selectedAuctionAddress]);

  // Get selected auction
  const selectedAuction = auctions.find(
    (a) => a.rigAddress === selectedAuctionAddress
  );

  // Calculate values for selected auction
  // LP price is in DONUT value, convert to USD
  const selectedLpPriceUsd = selectedAuction
    ? Number(formatEther(selectedAuction.auctionState.price)) *
      Number(formatEther(selectedAuction.auctionState.paymentTokenPrice)) *
      donutUsdPrice
    : 0;
  const selectedWethValueUsd = selectedAuction
    ? Number(formatEther(selectedAuction.auctionState.wethAccumulated)) *
      ethUsdPrice
    : 0;
  const selectedProfitLoss = selectedWethValueUsd - selectedLpPriceUsd;
  const hasInsufficientBalance = selectedAuction
    ? selectedAuction.auctionState.paymentTokenBalance <
      selectedAuction.auctionState.price
    : true;

  // Get token symbol and rigUri for selected auction (always call hooks, pass undefined if no selection)
  const { rigInfo: selectedRigInfo } = useRigInfo(
    selectedAuctionAddress ?? undefined
  );
  const { rigState: selectedRigState } = useRigState(
    selectedAuctionAddress ?? undefined,
    undefined
  );
  const selectedTokenSymbol = selectedRigInfo?.tokenSymbol ?? "TOKEN";
  const selectedRigUri = selectedRigState?.rigUri;

  const isBuying = batchState === "pending" || batchState === "confirming";

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 pb-4 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold tracking-wide">AUCTIONS</h1>
          {user ? (
            <div className="flex items-center gap-2 rounded-full bg-black px-3 py-1">
              <Avatar className="h-8 w-8 border border-zinc-800">
                <AvatarImage
                  src={userAvatarUrl || undefined}
                  alt={userDisplayName}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white">
                  {initialsFrom(userDisplayName)}
                </AvatarFallback>
              </Avatar>
              <div className="leading-tight text-left">
                <div className="text-sm font-bold">{userDisplayName}</div>
                {userHandle ? (
                  <div className="text-xs text-gray-400">{userHandle}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Auction Cards List */}
        <div className="flex-1 overflow-y-auto scrollbar-hide px-0.5 pt-0.5">
          {isLoading ? null : sortedAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
              <Flame className="h-12 w-12 mb-2 opacity-50" />
              <p className="text-lg font-semibold">No auctions available</p>
              <p className="text-sm mt-1">Check back later for opportunities</p>
            </div>
          ) : (
            sortedAuctions.map((auction) => (
              <AuctionCard
                key={auction.rigAddress}
                auction={auction}
                ethUsdPrice={ethUsdPrice}
                donutUsdPrice={donutUsdPrice}
                isSelected={selectedAuctionAddress === auction.rigAddress}
                onClick={() => setSelectedAuctionAddress(auction.rigAddress)}
              />
            ))
          )}
          {/* Spacer for bottom bar */}
          <div className="h-56" />
        </div>

        {/* Fixed Bottom Action Bar */}
        {selectedAuction && (
          <div className="fixed bottom-0 left-0 right-0 bg-black">
            <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
              {/* PnL Indicator */}
              <div
                className={cn(
                  "rounded-lg px-3 py-2 mb-3 text-center",
                  selectedProfitLoss > 0.01
                    ? "bg-green-500/20 border border-green-500/50"
                    : selectedProfitLoss >= -0.01
                      ? "bg-yellow-500/20 border border-yellow-500/50"
                      : "bg-red-500/20 border border-red-500/50"
                )}
              >
                {selectedProfitLoss > 0.01 ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-green-400 font-semibold">GOOD DEAL</span>
                    <span className="text-green-300 text-sm">
                      +${selectedProfitLoss.toFixed(2)} profit
                    </span>
                  </div>
                ) : selectedProfitLoss >= -0.01 ? (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-yellow-400 font-semibold">BREAK EVEN</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-red-400 font-semibold">WARNING</span>
                    <span className="text-red-300 text-sm">
                      -${Math.abs(selectedProfitLoss).toFixed(2)} loss
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between gap-4">
                {/* Auction Price */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>Auction price</span>
                    <a
                      href={`https://app.uniswap.org/explore/pools/base/${selectedAuction.auctionState.paymentToken}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-500 hover:text-purple-400"
                    >
                      Get LP
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} />
                    <span className="text-lg font-semibold text-white">
                      {formatEth(selectedAuction.auctionState.price, 4)}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600">
                    ~${selectedLpPriceUsd.toFixed(2)}
                  </div>
                </div>

                {/* Balance and Button */}
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500 mb-1">
                    <span>Balance:</span>
                    <LpPairIcon rigUri={selectedRigUri} tokenSymbol={selectedTokenSymbol} size="sm" />
                    <span className="text-white font-medium">
                      {formatEth(selectedAuction.auctionState.paymentTokenBalance, 4)}
                    </span>
                  </div>
                  <Button
                    className="w-[calc(50vw-16px)] max-w-[244px] py-2.5 text-sm font-semibold rounded-lg bg-purple-500 hover:bg-purple-600 text-black"
                    onClick={() => selectedAuction && handleBuy(selectedAuction)}
                    disabled={isBuying || hasInsufficientBalance}
                  >
                    {isBuying
                      ? batchState === "confirming"
                        ? "CONFIRMING..."
                        : "BUYING..."
                      : "BUY"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
      <NavBar />
    </main>
  );
}
