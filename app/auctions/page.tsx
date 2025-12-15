"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { sdk } from "@farcaster/miniapp-sdk";
import { Flame } from "lucide-react";
import {
  useAccount,
  useConnect,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
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
import { CONTRACT_ADDRESSES, MULTICALL_ABI, ERC20_ABI } from "@/lib/contracts";
import { cn, getEthPrice, getDonutPrice } from "@/lib/utils";

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

const DEADLINE_BUFFER_SECONDS = 5 * 60;

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
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

// Convert ipfs:// URL to gateway URL
const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

const ipfsToGateway = (uri: string) => {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
};

// LP Pair icon component - shows two overlapping token icons
function LpPairIcon({
  unitUri,
  tokenSymbol,
  size = "md",
  className
}: {
  unitUri?: string;
  tokenSymbol?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch metadata to get image URL
  useEffect(() => {
    if (!unitUri) return;

    const metadataUrl = ipfsToGateway(unitUri);
    if (!metadataUrl) return;

    fetch(metadataUrl)
      .then((res) => res.json())
      .then((metadata) => {
        if (metadata.image) {
          setLogoUrl(ipfsToGateway(metadata.image));
        }
      })
      .catch(() => {
        // Silently fail - will show fallback
      });
  }, [unitUri]);

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
    <div className={cn("relative flex items-center", className)}>
      {/* Unit token (left/front) */}
      <div className={cn(s.unit, "rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden z-20")}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt="Unit"
            className="w-full h-full object-cover"
          />
        ) : (
          <span className={cn(s.fallbackText, "font-bold text-pink-500")}>{fallbackLetter}</span>
        )}
      </div>
      {/* DONUT token (right/back) - donut shape, behind unit */}
      <div className={cn(s.donut, "rounded-full bg-pink-500 flex items-center justify-center z-10")}>
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
  const unitUri = rigState?.unitUri;

  const isProfitable = wethValueUsd > lpPriceUsd;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl p-3 cursor-pointer transition-all bg-zinc-900 mb-1.5",
        isSelected
          ? "ring-2 ring-pink-500 shadow-[0_0_15px_rgba(236,72,153,0.3)]"
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
            <LpPairIcon unitUri={unitUri} tokenSymbol={tokenSymbol} />
            <span className="text-sm font-bold text-pink-500">
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
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0.001);
  const [selectedAuctionAddress, setSelectedAuctionAddress] = useState<`0x${string}` | null>(null);
  const [txStep, setTxStep] = useState<"idle" | "approving" | "buying">("idle");
  const [pendingAuction, setPendingAuction] = useState<AuctionListItem | null>(
    null
  );

  // Wallet connection
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

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

  // Transaction handling
  const {
    data: txHash,
    writeContract,
    isPending: isWriting,
    reset: resetWrite,
  } = useWriteContract();

  const { data: receipt, isLoading: isConfirming } =
    useWaitForTransactionReceipt({
      hash: txHash,
      chainId: base.id,
    });

  // Fetch Farcaster context
  useEffect(() => {
    let cancelled = false;
    const hydrateContext = async () => {
      try {
        const ctx = (await (sdk as unknown as {
          context: Promise<MiniAppContext> | MiniAppContext;
        }).context) as MiniAppContext;
        if (!cancelled) {
          setContext(ctx);
        }
      } catch {
        if (!cancelled) setContext(null);
      }
    };
    hydrateContext();
    return () => {
      cancelled = true;
    };
  }, []);

  // SDK ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

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
    const interval = setInterval(fetchPrices, 60_000);
    return () => clearInterval(interval);
  }, []);

  // Auto-connect wallet
  useEffect(() => {
    if (
      autoConnectAttempted.current ||
      isConnected ||
      !primaryConnector ||
      isConnecting
    ) {
      return;
    }
    autoConnectAttempted.current = true;
    connectAsync({
      connector: primaryConnector,
      chainId: base.id,
    }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Handle receipt
  useEffect(() => {
    if (!receipt) return;

    if (receipt.status === "reverted") {
      setTxStep("idle");
      setPendingAuction(null);
      resetWrite();
      return;
    }

    if (receipt.status === "success") {
      if (txStep === "approving" && pendingAuction) {
        // Approval succeeded, now buy
        resetWrite();
        setTxStep("buying");
        return;
      }

      if (txStep === "buying") {
        // Buy succeeded!
        setTxStep("idle");
        setPendingAuction(null);
        refetchAuctions();
        resetWrite();
        return;
      }
    }
    return;
  }, [receipt, txStep, pendingAuction, resetWrite, refetchAuctions]);

  // Auto-trigger buy after approval
  useEffect(() => {
    if (
      txStep === "buying" &&
      pendingAuction &&
      !isWriting &&
      !isConfirming &&
      !txHash
    ) {
      executeBuy(pendingAuction);
    }
  }, [txStep, pendingAuction, isWriting, isConfirming, txHash]);

  const executeBuy = useCallback(
    async (auction: AuctionListItem) => {
      if (!address) return;

      const deadline = BigInt(
        Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS
      );

      await writeContract({
        account: address as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "buy",
        args: [
          auction.rigAddress,
          auction.auctionState.epochId,
          deadline,
          auction.auctionState.price,
        ],
        chainId: base.id,
      });
    },
    [address, writeContract]
  );

  const handleBuy = useCallback(
    async (auction: AuctionListItem) => {
      if (!address) {
        if (!primaryConnector) return;
        try {
          await connectAsync({
            connector: primaryConnector,
            chainId: base.id,
          });
        } catch {
          return;
        }
      }

      setPendingAuction(auction);

      try {
        // First approve LP tokens
        setTxStep("approving");
        await writeContract({
          account: address as Address,
          address: auction.auctionState.paymentToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [
            CONTRACT_ADDRESSES.multicall as Address,
            auction.auctionState.price,
          ],
          chainId: base.id,
        });
      } catch (error) {
        console.error("Approval failed:", error);
        setTxStep("idle");
        setPendingAuction(null);
        resetWrite();
      }
    },
    [address, connectAsync, primaryConnector, writeContract, resetWrite]
  );

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

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

  // Get token symbol and unitUri for selected auction (always call hooks, pass undefined if no selection)
  const { rigInfo: selectedRigInfo } = useRigInfo(
    selectedAuctionAddress ?? undefined
  );
  const { rigState: selectedRigState } = useRigState(
    selectedAuctionAddress ?? undefined,
    undefined
  );
  const selectedTokenSymbol = selectedRigInfo?.tokenSymbol ?? "TOKEN";
  const selectedUnitUri = selectedRigState?.unitUri;

  const isBuying = txStep !== "idle" && (isWriting || isConfirming);

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
          {context?.user && (
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
          )}
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
          <div className="h-24" />
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
                      className="text-pink-500 hover:text-pink-400"
                    >
                      Get LP
                    </a>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <LpPairIcon unitUri={selectedUnitUri} tokenSymbol={selectedTokenSymbol} />
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
                    <LpPairIcon unitUri={selectedUnitUri} tokenSymbol={selectedTokenSymbol} size="sm" />
                    <span className="text-white font-medium">
                      {formatEth(selectedAuction.auctionState.paymentTokenBalance, 4)}
                    </span>
                  </div>
                  <Button
                    className="w-[calc(50vw-16px)] max-w-[244px] py-2.5 text-sm font-semibold rounded-lg bg-pink-500 hover:bg-pink-600 text-black"
                    onClick={() => selectedAuction && handleBuy(selectedAuction)}
                    disabled={isBuying || hasInsufficientBalance}
                  >
                    {isBuying
                      ? txStep === "approving"
                        ? "APPROVING..."
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
