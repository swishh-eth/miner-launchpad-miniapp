"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowLeft, ArrowDownUp, Copy, Check } from "lucide-react";
import Link from "next/link";
import {
  useAccount,
  useBalance,
  useConnect,
  useReadContract,
  useSendTransaction,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { formatEther, formatUnits, parseUnits, type Address, zeroAddress } from "viem";

import { NavBar } from "@/components/nav-bar";
import { PriceChart } from "@/components/price-chart";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useRigState, useRigInfo } from "@/hooks/useRigState";
import { useUserRigStats } from "@/hooks/useUserRigStats";
import { usePriceHistory } from "@/hooks/usePriceHistory";
import { useMineHistory } from "@/hooks/useMineHistory";
import { CONTRACT_ADDRESSES, MULTICALL_ABI, ERC20_ABI, NATIVE_ETH_ADDRESS } from "@/lib/contracts";
import { getEthPrice, getDonutPrice, cn } from "@/lib/utils";
import { useSwapPrice, useSwapQuote, formatBuyAmount } from "@/hooks/useSwapQuote";

const DEADLINE_BUFFER_SECONDS = 15 * 60;
const TOKEN_DECIMALS = 18;

const formatUsd = (value: number, compact = false) => {
  if (compact) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
  }
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value: number) => {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
};

const PINATA_GATEWAY = process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

const ipfsToGateway = (uri: string | undefined) => {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) {
    return `${PINATA_GATEWAY}/ipfs/${uri.slice(7)}`;
  }
  return uri;
};

export default function RigDetailPage() {
  const params = useParams();
  const rigAddress = params.address as `0x${string}`;

  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [customMessage, setCustomMessage] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(3500);
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0.001);
  const [mineResult, setMineResult] = useState<"success" | "failure" | null>(null);
  const mineResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tradeResult, setTradeResult] = useState<"success" | "failure" | null>(null);
  const tradeResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedTimeframe, setSelectedTimeframe] = useState<"1D" | "1W" | "1M" | "ALL">("1D");
  const [showHeaderTicker, setShowHeaderTicker] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const priceRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // Trade mode state
  const [mode, setMode] = useState<"mine" | "trade">("mine");
  const [tradeDirection, setTradeDirection] = useState<"buy" | "sell">("buy"); // buy = ETH -> Unit, sell = Unit -> ETH
  const [tradeAmount, setTradeAmount] = useState("");

  // Wallet connection
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  // Rig data
  const { rigState, refetch: refetchRigState } = useRigState(rigAddress, address);
  const { rigInfo } = useRigInfo(rigAddress);
  const { stats: userStats } = useUserRigStats(address, rigAddress);

  // Calculate fallback price for chart (unitPrice is in DONUT)
  const fallbackChartPrice = rigState?.unitPrice
    ? Number(formatEther(rigState.unitPrice)) * donutUsdPrice
    : 0;
  const { priceHistory, pairData, lpAddress, isLoading: isLoadingPrice } = usePriceHistory(rigAddress, fallbackChartPrice, rigInfo?.unitAddress);
  const { mines: mineHistory } = useMineHistory(rigAddress, 10);

  // Token total supply
  const { data: totalSupplyRaw } = useReadContract({
    address: rigInfo?.unitAddress,
    abi: ERC20_ABI,
    functionName: "totalSupply",
    chainId: base.id,
    query: {
      enabled: !!rigInfo?.unitAddress,
    },
  });

  // Transaction handling (mining)
  const { data: txHash, writeContract, isPending: isWriting, reset: resetWrite } = useWriteContract();
  const { data: receipt, isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash, chainId: base.id });

  // Trade transaction handling
  const { writeContract: writeApprove, isPending: isApproving, data: approveTxHash } = useWriteContract();
  const { sendTransaction, isPending: isSwapping, data: swapTxHash } = useSendTransaction();
  const { isLoading: isWaitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({ hash: approveTxHash });
  const { isLoading: isWaitingSwap, isSuccess: swapSuccess, isError: swapError } = useWaitForTransactionReceipt({ hash: swapTxHash });

  // Trade balances
  const queryClient = useQueryClient();

  const { data: ethBalanceData } = useBalance({
    address,
    chainId: base.id,
  });

  const { data: unitBalanceData } = useBalance({
    address,
    token: rigInfo?.unitAddress as Address,
    chainId: base.id,
    query: { enabled: !!rigInfo?.unitAddress },
  });

  const refetchBalances = useCallback(() => {
    // Invalidate all balance queries to force fresh fetch
    queryClient.invalidateQueries({ queryKey: ['balance'] });
  }, [queryClient]);

  // Swap tokens for trading
  const sellToken = tradeDirection === "buy" ? NATIVE_ETH_ADDRESS : (rigInfo?.unitAddress || "");
  const buyToken = tradeDirection === "buy" ? (rigInfo?.unitAddress || "") : NATIVE_ETH_ADDRESS;
  const sellDecimals = tradeDirection === "buy" ? 18 : 18; // ETH and unit tokens are both 18 decimals

  // Get price quote
  const { data: tradePriceQuote, isLoading: isLoadingTradePrice, error: tradePriceError } = useSwapPrice({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    enabled: mode === "trade" && !!rigInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0,
  });

  // Calculate output amount and price impact for auto slippage
  const tradeOutputAmountForSlippage = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";

  // Auto slippage: price impact + 1%, minimum 1%, maximum 49%
  const slippage = useMemo(() => {
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return 1;

    // Try Kyber's USD values first
    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    // If Kyber doesn't have USD data, calculate ourselves
    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = rigState?.unitPrice && rigState.unitPrice > 0n
        ? Number(formatEther(rigState.unitPrice)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmountForSlippage) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return 2;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    // Add 2% buffer on top of price impact to account for price movement
    return Math.min(49, Math.max(2, Math.ceil(Math.max(0, impact)) + 2));
  }, [tradePriceQuote, tradeAmount, tradeOutputAmountForSlippage, tradeDirection, ethUsdPrice, pairData?.priceUsd, rigState?.unitPrice, donutUsdPrice]);

  // Get full quote for trading
  const { data: tradeQuote, isLoading: isLoadingTradeQuote, refetch: refetchTradeQuote } = useSwapQuote({
    sellToken,
    buyToken,
    sellAmount: tradeAmount || "0",
    sellTokenDecimals: sellDecimals,
    taker: address,
    slippageBps: Math.round(slippage * 100),
    enabled: mode === "trade" && !!rigInfo?.unitAddress && !!tradeAmount && parseFloat(tradeAmount) > 0 && !!address,
  });

  // Check allowance for selling unit tokens
  const { data: unitAllowance, refetch: refetchAllowance } = useReadContract({
    address: rigInfo?.unitAddress as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && tradeQuote?.transaction?.to
      ? [address, tradeQuote.transaction.to as Address]
      : undefined,
    chainId: base.id,
    query: {
      enabled: tradeDirection === "sell" && !!rigInfo?.unitAddress && !!address && !!tradeQuote?.transaction?.to,
    },
  });

  const needsTradeApproval = useMemo(() => {
    if (tradeDirection === "buy" || !tradeAmount || parseFloat(tradeAmount) === 0) return false;
    // If we don't have allowance data yet or quote isn't loaded, assume we need approval for sells
    if (unitAllowance === undefined || unitAllowance === null || !tradeQuote?.transaction?.to) return true;
    try {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      const currentAllowance = BigInt(unitAllowance.toString());
      return currentAllowance < sellAmountWei;
    } catch {
      return true; // Default to needing approval if something goes wrong
    }
  }, [tradeDirection, tradeAmount, unitAllowance, tradeQuote?.transaction?.to]);

  // Result handling
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

  useEffect(() => {
    return () => {
      if (mineResultTimeoutRef.current) clearTimeout(mineResultTimeoutRef.current);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
    };
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
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Scroll handler for header ticker - show when price bottom gets covered by header
  useEffect(() => {
    const container = scrollContainerRef.current;
    const price = priceRef.current;
    const header = headerRef.current;
    if (!container || !price || !header) return;

    const handleScroll = () => {
      const priceRect = price.getBoundingClientRect();
      const headerRect = header.getBoundingClientRect();
      // Show ticker when price bottom goes above the header bottom
      setShowHeaderTicker(priceRect.bottom < headerRect.bottom);
    };

    // Run once on mount to set initial state
    handleScroll();

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [rigInfo, rigState]); // Re-run when data loads

  // Handle receipt
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

  // Interpolated mining values
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

  // Mine handler
  const handleMine = useCallback(async () => {
    if (!rigState) return;
    resetMineResult();
    try {
      let targetAddress = address;
      if (!targetAddress) {
        if (!primaryConnector) throw new Error("Wallet connector not available yet.");
        const result = await connectAsync({ connector: primaryConnector, chainId: base.id });
        targetAddress = result.accounts[0];
      }
      if (!targetAddress) throw new Error("Unable to determine wallet address.");

      const price = rigState.price;
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_BUFFER_SECONDS);
      const maxPrice = price === 0n ? 0n : (price * 105n) / 100n;

      await writeContract({
        account: targetAddress as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "mine",
        args: [rigAddress, rigState.epochId, deadline, maxPrice, customMessage.trim() || "gm"],
        value: price,
        chainId: base.id,
      });
    } catch (error) {
      console.error("Failed to mine:", error);
      showMineResult("failure");
      resetWrite();
    }
  }, [address, connectAsync, customMessage, rigState, rigAddress, primaryConnector, resetMineResult, resetWrite, showMineResult, writeContract]);

  // Trade handlers
  const [pendingSwapAfterApproval, setPendingSwapAfterApproval] = useState(false);

  const executeSwap = useCallback(() => {
    if (!tradeQuote?.transaction || !address) return;
    sendTransaction({
      to: tradeQuote.transaction.to as Address,
      data: tradeQuote.transaction.data as `0x${string}`,
      value: BigInt(tradeQuote.transaction.value || "0"),
      chainId: base.id,
    });
  }, [tradeQuote, address, sendTransaction]);

  const handleTrade = useCallback(async () => {
    if (!tradeQuote?.transaction || !address || !tradeAmount) return;

    // If approval is needed, approve first then swap
    if (needsTradeApproval && rigInfo?.unitAddress) {
      setPendingSwapAfterApproval(true);
      const sellAmountWei = parseUnits(tradeAmount, 18);
      writeApprove({
        address: rigInfo.unitAddress as Address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [tradeQuote.transaction.to as Address, sellAmountWei],
        chainId: base.id,
      });
    } else {
      // No approval needed, just swap
      executeSwap();
    }
  }, [tradeQuote, address, tradeAmount, needsTradeApproval, rigInfo?.unitAddress, writeApprove, executeSwap]);

  // Track last processed swap hash to detect new successful swaps
  const lastProcessedSwapHash = useRef<string | null>(null);

  // Handle swap result
  useEffect(() => {
    if (swapSuccess && swapTxHash && swapTxHash !== lastProcessedSwapHash.current) {
      lastProcessedSwapHash.current = swapTxHash;
      setTradeAmount("");
      setPendingSwapAfterApproval(false);
      // Refetch balances after a short delay to let RPC update
      setTimeout(() => {
        refetchBalances();
        refetchRigState();
      }, 1000);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("success");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapSuccess, swapTxHash, refetchBalances, refetchRigState]);

  // Track last processed error hash
  const lastProcessedErrorHash = useRef<string | null>(null);

  // Handle swap failure
  useEffect(() => {
    if (swapError && swapTxHash && swapTxHash !== lastProcessedErrorHash.current) {
      lastProcessedErrorHash.current = swapTxHash;
      setPendingSwapAfterApproval(false);
      if (tradeResultTimeoutRef.current) clearTimeout(tradeResultTimeoutRef.current);
      setTradeResult("failure");
      tradeResultTimeoutRef.current = setTimeout(() => {
        setTradeResult(null);
        tradeResultTimeoutRef.current = null;
      }, 3000);
    }
  }, [swapError, swapTxHash]);

  // After approval success, refetch and execute swap if pending
  useEffect(() => {
    if (approveSuccess) {
      refetchAllowance();
      refetchTradeQuote();
      // If we were waiting to swap after approval, execute the swap now
      if (pendingSwapAfterApproval) {
        setPendingSwapAfterApproval(false);
        // Small delay to ensure state is updated
        setTimeout(() => {
          executeSwap();
        }, 100);
      }
    }
  }, [approveSuccess, refetchAllowance, refetchTradeQuote, pendingSwapAfterApproval, executeSwap]);

  // Trade calculations
  const tradeBalance = tradeDirection === "buy" ? ethBalanceData : unitBalanceData;
  const tradeOutputAmount = tradePriceQuote?.buyAmount
    ? formatBuyAmount(tradePriceQuote.buyAmount, 18)
    : "0";
  const formattedTradeOutput = parseFloat(tradeOutputAmount).toLocaleString(undefined, { maximumFractionDigits: 6 });

  // Calculate price impact for display
  const priceImpact = useMemo(() => {
    // No quote yet = loading
    if (!tradePriceQuote?.buyAmount || !tradeAmount || parseFloat(tradeAmount) === 0) return null;

    // Try Kyber's USD values first
    let inputUsd = tradePriceQuote?.sellAmountUsd ? parseFloat(tradePriceQuote.sellAmountUsd) : 0;
    let outputUsd = tradePriceQuote?.buyAmountUsd ? parseFloat(tradePriceQuote.buyAmountUsd) : 0;

    // If Kyber doesn't have USD data, calculate ourselves (same as UI display)
    if (inputUsd === 0 || outputUsd === 0) {
      const dexPrice = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
      const onChainPrice = rigState?.unitPrice && rigState.unitPrice > 0n
        ? Number(formatEther(rigState.unitPrice)) * donutUsdPrice
        : 0;
      const tokenPrice = dexPrice ?? onChainPrice;

      inputUsd = parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : tokenPrice);
      outputUsd = parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? tokenPrice : ethUsdPrice);
    }

    if (inputUsd === 0) return null;

    const impact = ((inputUsd - outputUsd) / inputUsd) * 100;
    return Math.max(0, impact); // Don't show negative impact
  }, [tradePriceQuote, tradeAmount, tradeOutputAmount, tradeDirection, ethUsdPrice, pairData?.priceUsd, rigState?.unitPrice, donutUsdPrice]);

  const tradeInsufficientBalance = useMemo(() => {
    if (!tradeAmount || !tradeBalance) return false;
    try {
      const sellAmountWei = parseUnits(tradeAmount, 18);
      return sellAmountWei > tradeBalance.value;
    } catch {
      return false;
    }
  }, [tradeAmount, tradeBalance]);

  const isTradeLoading = isLoadingTradePrice || isLoadingTradeQuote;
  const isTradePending = isApproving || isWaitingApprove || isSwapping || isWaitingSwap;

  const buttonLabel = useMemo(() => {
    if (!rigState) return "LOADING...";
    if (mineResult === "failure") return "FAILED";
    if (isWriting || isConfirming) return "MINING...";
    return "MINE";
  }, [mineResult, isConfirming, isWriting, rigState]);

  const isMineDisabled = !rigState || isWriting || isConfirming || mineResult === "failure";
  const tokenSymbol = rigInfo?.tokenSymbol ?? "TOKEN";
  const tokenName = rigInfo?.tokenName ?? "Loading...";

  // Check if there's no liquidity
  const hasNoLiquidity = tradePriceError || (tradeAmount && parseFloat(tradeAmount) > 0 && !isLoadingTradePrice && !tradePriceQuote?.buyAmount);

  // Trade button text (after tokenSymbol is defined)
  const tradeButtonText = useMemo(() => {
    if (tradeResult === "success") return "Trade successful!";
    if (tradeResult === "failure") return "Trade failed";
    if (!isConnected) return "Connect Wallet";
    if (!tradeAmount || parseFloat(tradeAmount) === 0) return "Enter amount";
    if (tradeInsufficientBalance) return "Insufficient balance";
    if (hasNoLiquidity) return "No liquidity";
    if (isApproving || isWaitingApprove) return "Approving...";
    if (isSwapping || isWaitingSwap) return "Swapping...";
    if (isLoadingTradeQuote) return "Loading...";
    return tradeDirection === "buy" ? "Buy" : "Sell";
  }, [tradeResult, isConnected, tradeAmount, tradeInsufficientBalance, hasNoLiquidity, isApproving, isWaitingApprove, isSwapping, isWaitingSwap, isLoadingTradeQuote, tradeDirection]);

  const canTrade = isConnected && tradeAmount && parseFloat(tradeAmount) > 0 && !tradeInsufficientBalance && !isTradeLoading && !hasNoLiquidity && !!tradeQuote?.transaction?.to;

  // Calculate values - unitPrice is in DONUT, so use donutUsdPrice
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
  // Token price in USD (unitPrice is in DONUT)
  const tokenPriceUsd = unitPrice > 0n ? Number(formatEther(unitPrice)) * donutUsdPrice : 0;

  // Token stats - prefer DexScreener data when available
  const totalSupply = totalSupplyRaw ? Number(formatUnits(totalSupplyRaw as bigint, TOKEN_DECIMALS)) : 0;
  const dexPriceUsd = pairData?.priceUsd ? parseFloat(pairData.priceUsd) : null;
  const displayPriceUsd = dexPriceUsd ?? tokenPriceUsd;
  const marketCap = pairData?.marketCap ?? (totalSupply * displayPriceUsd);
  const liquidity = pairData?.liquidity?.usd ?? 0;
  const volume24h = pairData?.volume?.h24 ?? 0;
  const priceChange24h = pairData?.priceChange?.h24 ?? 0;

  // User balances - unitPrice is in DONUT
  const unitBalance = rigState?.unitBalance ? Number(formatUnits(rigState.unitBalance, TOKEN_DECIMALS)) : 0;
  const unitBalanceUsd = unitPrice > 0n ? unitBalance * Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const ethBalance = rigState?.ethBalance ? Number(formatEther(rigState.ethBalance)) : 0;

  // User stats from subgraph
  const totalMined = userStats?.totalMined ? Number(formatUnits(userStats.totalMined, TOKEN_DECIMALS)) : 0;
  const totalMinedUsd = unitPrice > 0n ? totalMined * Number(formatEther(unitPrice)) * donutUsdPrice : 0;
  const totalSpent = userStats?.totalSpent ? Number(formatEther(userStats.totalSpent)) : 0;
  const totalSpentUsd = totalSpent * ethUsdPrice;
  const totalEarned = userStats?.totalEarned ? Number(formatEther(userStats.totalEarned)) : 0;
  const totalEarnedUsd = totalEarned * ethUsdPrice;

  const minerAddress = rigState?.miner ?? zeroAddress;
  const hasMiner = minerAddress !== zeroAddress;
  const isCurrentUserMiner = address && minerAddress.toLowerCase() === address.toLowerCase();

  // Fetch miner profile
  const { data: minerProfile } = useQuery<{
    user: {
      fid: number | null;
      username: string | null;
      displayName: string | null;
      pfpUrl: string | null;
    } | null;
  }>({
    queryKey: ["neynar-user", minerAddress],
    queryFn: async () => {
      const res = await fetch(`/api/neynar/user?address=${encodeURIComponent(minerAddress)}`);
      if (!res.ok) return { user: null };
      return res.json();
    },
    enabled: hasMiner,
    staleTime: 60_000,
    retry: false,
  });

  const minerDisplayName =
    minerProfile?.user?.displayName ??
    minerProfile?.user?.username ??
    `${minerAddress.slice(0, 6)}...${minerAddress.slice(-4)}`;
  const minerAvatarUrl =
    minerProfile?.user?.pfpUrl ??
    `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(minerAddress.toLowerCase())}`;

  // Fetch token metadata from IPFS
  const { data: tokenMetadata } = useQuery<{
    image?: string;
    description?: string;
    links?: string[];
    // Legacy format support
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
  }>({
    queryKey: ["tokenMetadata", rigState?.unitUri],
    queryFn: async () => {
      if (!rigState?.unitUri) return null;
      const metadataUrl = ipfsToGateway(rigState.unitUri);
      if (!metadataUrl) return null;
      const response = await fetch(metadataUrl);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!rigState?.unitUri,
    staleTime: 60_000,
    retry: false,
  });

  // Token logo from metadata
  const tokenLogoUrl = tokenMetadata?.image ? ipfsToGateway(tokenMetadata.image) : null;

  const formatTime = (seconds: number): string => {
    if (seconds < 0) return "0s";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    if (minutes > 0) return `${minutes}m ${secs}s`;
    return `${secs}s`;
  };

  const handleCopyAddress = useCallback(async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
      setTimeout(() => setCopiedAddress(null), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  // Chart data from DexScreener
  const chartData = priceHistory;

  // Show nothing until essential data is ready
  const isPageLoading = !rigInfo || !rigState;

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
        <NavBar />
      </main>
    );
  }

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        }}
      >
        {/* Fixed Header */}
        <div ref={headerRef} className="px-2 pb-2">
          <div className="relative flex items-center justify-between">
            <Link href="/explore" className="p-1 -ml-1 hover:opacity-70 transition-opacity z-10">
              <ArrowLeft className="h-5 w-5 text-pink-500" />
            </Link>
            {/* Center ticker - absolutely positioned for true centering */}
            <div
              className={cn(
                "absolute left-1/2 -translate-x-1/2 text-center transition-opacity duration-200",
                showHeaderTicker ? "opacity-100" : "opacity-0 pointer-events-none"
              )}
            >
              <div className="text-xs font-medium text-white">{tokenName}</div>
              <div className="text-xs text-zinc-400">${displayPriceUsd.toFixed(6)}</div>
            </div>
            {/* Mode Toggle Button */}
            <button
              onClick={() => {
                setMode(mode === "mine" ? "trade" : "mine");
                setTradeAmount("");
              }}
              className="px-3 py-1.5 rounded-lg bg-pink-500 hover:bg-pink-600 transition-colors text-black text-xs font-semibold z-10 outline-none focus:outline-none"
            >
              {mode === "mine" ? "Trade" : "Mine"}
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto scrollbar-hide">
          {/* Token Info + Price */}
          <div className="px-2 flex gap-3">
            <div className="flex-1">
              <div className="text-xs text-zinc-500 font-medium">${tokenSymbol}</div>
              <h1 className="text-xl font-bold">{tokenName}</h1>
              <div ref={priceRef} className="mt-1 flex items-baseline gap-2">
                <span className="text-2xl font-bold">${displayPriceUsd.toFixed(6)}</span>
                {priceChange24h !== 0 && (
                  <span className={cn(
                    "text-sm font-medium",
                    priceChange24h >= 0 ? "text-pink-500" : "text-zinc-500"
                  )}>
                    {priceChange24h >= 0 ? "+" : ""}{priceChange24h.toFixed(2)}%
                  </span>
                )}
              </div>
            </div>
            {/* Token Logo */}
            <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-900 flex items-center justify-center flex-shrink-0">
              {tokenLogoUrl ? (
                <img src={tokenLogoUrl} alt={tokenSymbol} className="w-12 h-12 object-contain" />
              ) : (
                <span className="text-lg font-bold text-pink-500">{tokenSymbol.slice(0, 2)}</span>
              )}
            </div>
          </div>

          {/* Chart */}
          <div className="mt-4">
            <PriceChart data={chartData} isLoading={isLoadingPrice} height={160} />
          </div>

          {/* Timeframe Tabs */}
          <div className="flex justify-between px-2 mt-2">
            {(["1D", "1W", "1M", "ALL"] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={cn(
                  "flex-1 py-2 text-xs font-medium transition-colors",
                  selectedTimeframe === tf
                    ? "text-pink-500"
                    : "text-zinc-600 hover:text-zinc-400"
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {/* Miner */}
          {hasMiner && (
            <div className="px-2 mt-6">
              <h2 className="text-base font-bold mb-3">Miner</h2>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={minerAvatarUrl} alt={minerDisplayName} />
                  <AvatarFallback className="bg-zinc-800 text-white text-xs">
                    {minerAddress.slice(-2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-white">
                    {minerDisplayName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {minerAddress.slice(0, 6)}...{minerAddress.slice(-4)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-zinc-500">{formatTime(glazeElapsedSeconds)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                <div>
                  <div className="text-xs text-zinc-500">Mine rate</div>
                  <div className="text-sm font-semibold">
                    {Number(formatUnits(rigState?.nextUps ?? 0n, TOKEN_DECIMALS)).toFixed(2)}/s
                  </div>
                  <div className="text-[10px] text-zinc-600">${rateUsd.toFixed(4)}/s</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Mined</div>
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <span>+</span>
                    {tokenLogoUrl ? (
                      <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[8px] text-black font-bold">
                        {tokenSymbol.slice(0, 2)}
                      </span>
                    )}
                    <span>{Number(formatUnits(glazedAmount, TOKEN_DECIMALS)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                  </div>
                  <div className="text-[10px] text-zinc-600">{formatUsd(glazedUsd)}</div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">Total</div>
                  <div className="text-sm font-semibold">
                    +{formatUsd(glazedUsd + glazedUsd)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-zinc-500">PnL</div>
                  <div className="text-sm font-semibold">
                    +Ξ{(glazedUsd / ethUsdPrice).toFixed(4)}
                  </div>
                  <div className="text-[10px] text-zinc-600">{formatUsd(glazedUsd)}</div>
                </div>
              </div>
            </div>
          )}

          {/* Your Position */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">Your position</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-zinc-500">Balance</div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {tokenLogoUrl ? (
                    <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[8px] text-black font-bold">
                      {tokenSymbol.slice(0, 2)}
                    </span>
                  )}
                  <span>{unitBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="text-[10px] text-zinc-600">{formatUsd(unitBalanceUsd)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Mined</div>
                <div className="flex items-center gap-1 text-sm font-semibold">
                  {tokenLogoUrl ? (
                    <img src={tokenLogoUrl} alt={tokenSymbol} className="w-4 h-4 rounded-full" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center text-[8px] text-black font-bold">
                      {tokenSymbol.slice(0, 2)}
                    </span>
                  )}
                  <span>{totalMined.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="text-[10px] text-zinc-600">{formatUsd(totalMinedUsd)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Spent</div>
                <div className="text-sm font-semibold">Ξ{totalSpent.toFixed(4)}</div>
                <div className="text-[10px] text-zinc-600">{formatUsd(totalSpentUsd)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Earned</div>
                <div className="text-sm font-semibold">Ξ{totalEarned.toFixed(4)}</div>
                <div className="text-[10px] text-zinc-600">{formatUsd(totalEarnedUsd)}</div>
              </div>
            </div>
          </div>

          {/* About */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">About</h2>
            <p className="text-sm text-zinc-400 mb-3">
              {tokenMetadata?.description || `${tokenName} is a token launched on the Miner Launchpad.`}
            </p>

            {/* Links */}
            <div className="flex flex-wrap gap-2">
              {/* New format: links array */}
              {tokenMetadata?.links?.map((link, index) => {
                const url = link.startsWith("http") ? link : `https://${link}`;
                // Extract display name from URL
                let label = "Link";
                try {
                  const hostname = new URL(url).hostname.replace("www.", "");
                  if (hostname.includes("twitter") || hostname.includes("x.com")) label = "Twitter";
                  else if (hostname.includes("telegram") || hostname.includes("t.me")) label = "Telegram";
                  else if (hostname.includes("discord")) label = "Discord";
                  else if (hostname.includes("github")) label = "GitHub";
                  else label = hostname.split(".")[0].charAt(0).toUpperCase() + hostname.split(".")[0].slice(1);
                } catch {
                  label = "Link";
                }
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
              })}
              {/* Legacy format support */}
              {!tokenMetadata?.links?.length && tokenMetadata?.website && (
                <a
                  href={tokenMetadata.website.startsWith("http") ? tokenMetadata.website : `https://${tokenMetadata.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Website
                </a>
              )}
              {!tokenMetadata?.links?.length && tokenMetadata?.twitter && (
                <a
                  href={`https://x.com/${tokenMetadata.twitter}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Twitter
                </a>
              )}
              {!tokenMetadata?.links?.length && tokenMetadata?.telegram && (
                <a
                  href={`https://t.me/${tokenMetadata.telegram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Telegram
                </a>
              )}
              {!tokenMetadata?.links?.length && tokenMetadata?.discord && (
                <a
                  href={tokenMetadata.discord.startsWith("http") ? tokenMetadata.discord : `https://discord.gg/${tokenMetadata.discord}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  Discord
                </a>
              )}
              {rigInfo?.unitAddress && (
                <button
                  onClick={() => handleCopyAddress(rigInfo.unitAddress)}
                  className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                >
                  <span>{tokenSymbol}</span>
                  {copiedAddress === rigInfo.unitAddress ? (
                    <Check className="w-3 h-3 text-pink-500" />
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
                    <Check className="w-3 h-3 text-pink-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">Stats</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div>
                <div className="text-xs text-zinc-500">Market cap</div>
                <div className="text-sm font-semibold">{formatUsd(marketCap, true)}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total supply</div>
                <div className="text-sm font-semibold">{totalSupply.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Liquidity</div>
                <div className="text-sm font-semibold">{liquidity > 0 ? formatUsd(liquidity, true) : "—"}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">24h volume</div>
                <div className="text-sm font-semibold">{volume24h > 0 ? formatUsd(volume24h, true) : "—"}</div>
              </div>
            </div>
          </div>

          {/* Recent Mines */}
          <div className="px-2 mt-6">
            <h2 className="text-base font-bold mb-3">Recent mines</h2>
            <div className="space-y-2">
              {mineHistory.length === 0 ? (
                <div className="text-sm text-zinc-500">No mines yet</div>
              ) : (
                [...mineHistory].reverse().map((mine) => (
                  <div
                    key={mine.id}
                    className="flex items-start gap-3 p-3 rounded-xl bg-zinc-900/50"
                  >
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarImage
                        src={`https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(mine.miner.toLowerCase())}`}
                        alt={mine.miner}
                      />
                      <AvatarFallback className="bg-zinc-800 text-white text-xs">
                        {mine.miner.slice(2, 4).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-400">
                        {mine.miner.slice(0, 6)}...{mine.miner.slice(-4)}
                      </div>
                      {mine.uri && (
                        <div className="text-sm text-white mt-0.5 break-words">
                          {mine.uri}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 flex-shrink-0">
                      Ξ{Number(formatEther(mine.price)).toFixed(4)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Spacer for bottom bar - taller in trade mode */}
          <div className={mode === "trade" ? "h-96" : "h-32"} />
        </div>

        {/* Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm">
          <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
            {mode === "mine" ? (
              <>
                <input
                  type="text"
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Add a message..."
                  maxLength={100}
                  className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none disabled:opacity-40 mb-2"
                  disabled={isMineDisabled}
                />
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-zinc-500 mb-1">Mine price</div>
                    <div className="text-lg font-semibold">Ξ{priceEth.toFixed(6)}</div>
                    <div className="text-xs text-zinc-600">{formatUsd(priceUsd)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 mb-1">
                      Balance: Ξ{ethBalance.toFixed(4)}
                    </div>
                    <button
                      onClick={handleMine}
                      disabled={isMineDisabled}
                      className={cn(
                        "w-[calc(50vw-16px)] max-w-[244px] py-2.5 rounded-lg font-semibold transition-all text-sm",
                        mineResult === "failure"
                          ? "bg-zinc-700 text-white"
                          : "bg-pink-500 text-black hover:bg-pink-600 active:scale-[0.98]",
                        isMineDisabled && !mineResult && "opacity-40 cursor-not-allowed"
                      )}
                    >
                      {buttonLabel}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Trade Mode UI */}
                {/* Trade Input */}
                <div className="bg-zinc-900 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">You pay</span>
                    {tradeBalance && (
                      <button
                        onClick={() => {
                          if (tradeDirection === "buy" && ethBalanceData) {
                            const maxEth = parseFloat(formatUnits(ethBalanceData.value, 18)) - 0.001;
                            setTradeAmount(Math.max(0, maxEth).toString());
                          } else if (tradeDirection === "sell" && unitBalanceData) {
                            setTradeAmount(formatUnits(unitBalanceData.value, 18));
                          }
                        }}
                        className="text-xs text-zinc-500 hover:text-zinc-400"
                      >
                        Balance: {parseFloat(formatUnits(tradeBalance.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={tradeAmount}
                      onChange={(e) => setTradeAmount(e.target.value)}
                      placeholder="0"
                      className="flex-1 min-w-0 bg-transparent text-xl font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="shrink-0 text-sm font-semibold text-zinc-400">
                      {tradeDirection === "buy" ? "ETH" : tokenSymbol}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {tradeAmount && parseFloat(tradeAmount) > 0
                      ? `$${(parseFloat(tradeAmount) * (tradeDirection === "buy" ? ethUsdPrice : displayPriceUsd)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "$0.00"}
                  </div>
                </div>

                {/* Swap Direction Button */}
                <div className="flex justify-center -my-4 relative z-10">
                  <button
                    onClick={() => {
                      setTradeDirection(tradeDirection === "buy" ? "sell" : "buy");
                      setTradeAmount("");
                    }}
                    className="bg-zinc-700 hover:bg-zinc-600 p-2 rounded-xl border-4 border-black transition-colors"
                  >
                    <ArrowDownUp className="w-4 h-4" />
                  </button>
                </div>

                {/* Trade Output */}
                <div className="bg-zinc-900/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-zinc-500">You receive</span>
                    <span className="text-xs text-zinc-500">
                      Balance: {tradeDirection === "buy"
                        ? (unitBalanceData ? parseFloat(formatUnits(unitBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                        : (ethBalanceData ? parseFloat(formatUnits(ethBalanceData.value, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 }) : "0")
                      }
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 text-xl font-semibold text-zinc-300">
                      {isTradeLoading && tradeAmount ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="animate-bounce-dot-1">•</span>
                          <span className="animate-bounce-dot-2">•</span>
                          <span className="animate-bounce-dot-3">•</span>
                        </span>
                      ) : formattedTradeOutput}
                    </div>
                    <span className="shrink-0 text-sm font-semibold text-zinc-400">
                      {tradeDirection === "buy" ? tokenSymbol : "ETH"}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {parseFloat(tradeOutputAmount) > 0
                      ? `$${(parseFloat(tradeOutputAmount) * (tradeDirection === "buy" ? displayPriceUsd : ethUsdPrice)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "$0.00"}
                  </div>
                </div>

                {/* Trade Info */}
                <div className="flex justify-between text-xs text-zinc-500 px-1 py-2">
                  <span>Min. received</span>
                  <span>
                    {tradePriceQuote?.buyAmount
                      ? (parseFloat(formatBuyAmount(tradePriceQuote.buyAmount, 18)) * (1 - slippage / 100)).toLocaleString(undefined, { maximumFractionDigits: 6 })
                      : "0"
                    } {tradeDirection === "buy" ? tokenSymbol : "ETH"}
                  </span>
                </div>
                <div className="flex justify-between text-xs px-1 pb-3">
                  <span className="text-zinc-500">Price impact / Slippage</span>
                  <span className={cn(
                    priceImpact !== null && priceImpact > 10 ? "text-red-500" :
                    priceImpact !== null && priceImpact > 5 ? "text-yellow-500" : "text-zinc-500"
                  )}>
                    {priceImpact !== null && priceImpact > 5 && "⚠️ "}
                    {priceImpact !== null ? `${priceImpact.toFixed(2)}%` : "—"} / {slippage}%
                  </span>
                </div>

                {/* Trade Button */}
                <button
                  onClick={handleTrade}
                  disabled={!canTrade || isTradePending || tradeResult !== null}
                  className={cn(
                    "w-full py-3 rounded-lg font-semibold transition-all text-sm bg-pink-500 text-black hover:bg-pink-600",
                    (!canTrade || isTradePending || tradeResult !== null) && "cursor-not-allowed",
                    (!canTrade || isTradePending) && tradeResult === null && "opacity-40"
                  )}
                >
                  {tradeButtonText}
                </button>

                {/* No Liquidity Message */}
                {hasNoLiquidity && tradeAmount && parseFloat(tradeAmount) > 0 && (
                  <div className="mt-2 text-center text-xs text-zinc-500">
                    This token may only be tradeable on its native DEX
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
