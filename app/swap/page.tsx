"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import { ArrowDownUp, ChevronDown, X } from "lucide-react";
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
import { formatUnits, parseUnits, type Address, maxUint256 } from "viem";

import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import { useSwapTokens, findToken, DEFAULT_ETH_TOKEN, type SwapToken } from "@/hooks/useSwapTokens";
import { useSwapPrice, useSwapQuote, formatBuyAmount } from "@/hooks/useSwapQuote";
import { CONTRACT_ADDRESSES, NATIVE_ETH_ADDRESS, ERC20_ABI } from "@/lib/contracts";
import { cn, getEthPrice } from "@/lib/utils";

// Token selector modal
function TokenSelectorModal({
  isOpen,
  onClose,
  onSelect,
  tokens,
  selectedToken,
  otherToken,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (token: SwapToken) => void;
  tokens: SwapToken[];
  selectedToken?: SwapToken;
  otherToken?: SwapToken;
}) {
  const [search, setSearch] = useState("");

  const filteredTokens = useMemo(() => {
    if (!search) return tokens;
    const lower = search.toLowerCase();
    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lower) ||
        t.name.toLowerCase().includes(lower) ||
        t.address.toLowerCase().includes(lower)
    );
  }, [tokens, search]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative w-full max-w-[520px] bg-zinc-900 rounded-t-2xl max-h-[70vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-lg font-semibold">Select token</h3>
          <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          <input
            type="text"
            placeholder="Search by name or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 bg-zinc-800 rounded-xl text-sm focus:outline-none"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {filteredTokens.map((token) => {
            const isSelected = selectedToken?.address.toLowerCase() === token.address.toLowerCase();
            const isOther = otherToken?.address.toLowerCase() === token.address.toLowerCase();
            return (
              <button
                key={token.address}
                onClick={() => {
                  if (!isOther) {
                    onSelect(token);
                    onClose();
                  }
                }}
                disabled={isOther}
                className={cn(
                  "w-full flex items-center gap-3 p-3 rounded-xl transition-colors",
                  isSelected && "bg-pink-500/20",
                  isOther && "opacity-40 cursor-not-allowed",
                  !isSelected && !isOther && "hover:bg-zinc-800"
                )}
              >
                <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                  {token.logoUrl ? (
                    <img src={token.logoUrl} alt={token.symbol} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-pink-500">
                      {token.symbol.slice(0, 2)}
                    </span>
                  )}
                </div>
                <div className="flex-1 text-left">
                  <div className="font-semibold">{token.symbol}</div>
                  <div className="text-sm text-zinc-500">{token.name}</div>
                </div>
                {token.isLaunchpadToken && (
                  <span className="text-xs px-2 py-0.5 bg-pink-500/20 text-pink-400 rounded-full">
                    Launchpad
                  </span>
                )}
              </button>
            );
          })}
          {filteredTokens.length === 0 && (
            <div className="text-center text-zinc-500 py-8">No tokens found</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SwapContent() {
  const searchParams = useSearchParams();
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);

  // Wallet
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  // Token list
  const { tokens, isLoading: isLoadingTokens } = useSwapTokens();

  // State - initialize sellToken with ETH directly
  const [sellToken, setSellToken] = useState<SwapToken>(DEFAULT_ETH_TOKEN);
  const [buyToken, setBuyToken] = useState<SwapToken | undefined>();
  const [sellAmount, setSellAmount] = useState("");
  const slippage = 1; // Auto slippage: 1%
  const [showSellTokenModal, setShowSellTokenModal] = useState(false);
  const [showBuyTokenModal, setShowBuyTokenModal] = useState(false);
  const [ethUsdPrice, setEthUsdPrice] = useState(3500);

  // Set buy token from URL param
  useEffect(() => {
    const buyAddress = searchParams.get("buy");
    if (buyAddress && tokens.length > 0 && !buyToken) {
      const token = findToken(tokens, buyAddress);
      if (token) setBuyToken(token);
    }
  }, [searchParams, tokens, buyToken]);

  // Fetch ETH price
  useEffect(() => {
    getEthPrice().then(setEthUsdPrice);
    const interval = setInterval(() => getEthPrice().then(setEthUsdPrice), 60_000);
    return () => clearInterval(interval);
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

  // Auto-connect
  useEffect(() => {
    if (autoConnectAttempted.current || isConnected || !primaryConnector || isConnecting) return;
    autoConnectAttempted.current = true;
    connectAsync({ connector: primaryConnector, chainId: base.id }).catch(() => {});
  }, [connectAsync, isConnected, isConnecting, primaryConnector]);

  // Get balances
  const { data: ethBalance } = useBalance({
    address,
    chainId: base.id,
  });

  const { data: sellTokenBalance } = useBalance({
    address,
    token: sellToken.isNative ? undefined : (sellToken.address as Address),
    chainId: base.id,
    query: { enabled: !sellToken.isNative },
  });

  const actualSellBalance = sellToken.isNative ? ethBalance : sellTokenBalance;

  // Get price quote
  const { data: priceQuote, isLoading: isLoadingPrice } = useSwapPrice({
    sellToken: sellToken.address,
    buyToken: buyToken?.address || "",
    sellAmount: sellAmount || "0",
    sellTokenDecimals: sellToken.decimals,
    enabled: !!buyToken && !!sellAmount && parseFloat(sellAmount) > 0,
  });

  // Get full quote when ready to swap
  const { data: fullQuote, isLoading: isLoadingQuote, refetch: refetchQuote } = useSwapQuote({
    sellToken: sellToken.address,
    buyToken: buyToken?.address || "",
    sellAmount: sellAmount || "0",
    sellTokenDecimals: sellToken.decimals,
    taker: address,
    slippageBps: Math.round(slippage * 100),
    enabled: !!buyToken && !!sellAmount && parseFloat(sellAmount) > 0 && !!address,
  });

  // Check allowance for ERC20 tokens
  const { data: allowance } = useReadContract({
    address: sellToken.address as Address,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address && fullQuote?.transaction?.to
      ? [address, fullQuote.transaction.to as Address]
      : undefined,
    chainId: base.id,
    query: {
      enabled: !sellToken.isNative && !!address && !!fullQuote?.transaction?.to,
    },
  });

  const needsApproval = useMemo(() => {
    if (sellToken.isNative || !sellAmount || !allowance) return false;
    const sellAmountWei = parseUnits(sellAmount, sellToken.decimals);
    return (allowance as bigint) < sellAmountWei;
  }, [sellToken, sellAmount, allowance]);

  // Transactions
  const { writeContract: writeApprove, isPending: isApproving, data: approveTxHash } = useWriteContract();
  const { sendTransaction, isPending: isSwapping, data: swapTxHash } = useSendTransaction();

  const { isLoading: isWaitingApprove, isSuccess: approveSuccess } = useWaitForTransactionReceipt({
    hash: approveTxHash,
  });

  const { isLoading: isWaitingSwap, isSuccess: swapSuccess } = useWaitForTransactionReceipt({
    hash: swapTxHash,
  });

  // Refetch quote after approval
  useEffect(() => {
    if (approveSuccess) {
      refetchQuote();
    }
  }, [approveSuccess, refetchQuote]);

  // Reset after successful swap
  useEffect(() => {
    if (swapSuccess) {
      setSellAmount("");
    }
  }, [swapSuccess]);

  const handleApprove = useCallback(async () => {
    if (!sellToken || !fullQuote?.transaction?.to || !address) return;

    writeApprove({
      address: sellToken.address as Address,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [fullQuote.transaction.to as Address, maxUint256],
      chainId: base.id,
    });
  }, [sellToken, fullQuote, address, writeApprove]);

  const handleSwap = useCallback(async () => {
    if (!fullQuote?.transaction || !address) return;

    sendTransaction({
      to: fullQuote.transaction.to as Address,
      data: fullQuote.transaction.data as `0x${string}`,
      value: BigInt(fullQuote.transaction.value || "0"),
      chainId: base.id,
    });
  }, [fullQuote, address, sendTransaction]);

  const handleConnect = useCallback(async () => {
    if (!primaryConnector) return;
    try {
      await connectAsync({ connector: primaryConnector, chainId: base.id });
    } catch {}
  }, [connectAsync, primaryConnector]);

  const switchTokens = useCallback(() => {
    if (!buyToken) return; // Can't switch if no buy token selected
    const temp = sellToken;
    setSellToken(buyToken);
    setBuyToken(temp);
    setSellAmount("");
  }, [sellToken, buyToken]);

  const setMaxAmount = useCallback(() => {
    if (!actualSellBalance) return;
    // Leave some ETH for gas if selling ETH
    if (sellToken.isNative) {
      const maxEth = parseFloat(formatUnits(actualSellBalance.value, 18)) - 0.001;
      setSellAmount(Math.max(0, maxEth).toString());
    } else {
      setSellAmount(formatUnits(actualSellBalance.value, actualSellBalance.decimals));
    }
  }, [actualSellBalance, sellToken]);

  // Calculate display values
  const buyAmount = priceQuote?.buyAmount
    ? formatBuyAmount(priceQuote.buyAmount, buyToken?.decimals || 18)
    : "0";

  const formattedBuyAmount = parseFloat(buyAmount).toLocaleString(undefined, {
    maximumFractionDigits: 6,
  });

  const insufficientBalance = useMemo(() => {
    if (!sellAmount || !actualSellBalance) return false;
    try {
      const sellAmountWei = parseUnits(sellAmount, sellToken.decimals);
      return sellAmountWei > actualSellBalance.value;
    } catch {
      return false;
    }
  }, [sellAmount, actualSellBalance, sellToken]);

  const isLoading = isLoadingPrice || isLoadingQuote;
  const isPending = isApproving || isWaitingApprove || isSwapping || isWaitingSwap;

  const buttonText = useMemo(() => {
    if (!isConnected) return "Connect Wallet";
    if (!buyToken) return "Select token";
    if (!sellAmount || parseFloat(sellAmount) === 0) return "Enter amount";
    if (insufficientBalance) return "Insufficient balance";
    if (isApproving || isWaitingApprove) return "Approving...";
    if (isSwapping || isWaitingSwap) return "Swapping...";
    if (needsApproval) return `Approve ${sellToken.symbol}`;
    return "Swap";
  }, [
    isConnected, sellToken, buyToken, sellAmount, insufficientBalance,
    isApproving, isWaitingApprove, isSwapping, isWaitingSwap, needsApproval
  ]);

  const canSwap = isConnected && buyToken && sellAmount &&
    parseFloat(sellAmount) > 0 && !insufficientBalance && !isLoading;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-2"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-wide">SWAP</h1>
        </div>

        {/* Swap Card */}
        <div className="bg-zinc-900 rounded-2xl p-4">
          {/* Sell Token */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-500">You pay</span>
              {actualSellBalance && (
                <button
                  onClick={setMaxAmount}
                  className="text-xs text-pink-500 hover:text-pink-400"
                >
                  Balance: {parseFloat(formatUnits(actualSellBalance.value, actualSellBalance.decimals)).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="number"
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                placeholder="0"
                className="flex-1 min-w-0 bg-transparent text-2xl font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                onClick={() => setShowSellTokenModal(true)}
                className="shrink-0 flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-xl transition-colors"
              >
                <div className="w-6 h-6 rounded-full bg-zinc-600 overflow-hidden">
                  {sellToken.logoUrl ? (
                    <img src={sellToken.logoUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="flex items-center justify-center h-full text-xs font-bold text-pink-500">
                      {sellToken.symbol.slice(0, 2)}
                    </span>
                  )}
                </div>
                <span className="font-semibold">{sellToken.symbol}</span>
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Switch Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={switchTokens}
              className="bg-zinc-700 hover:bg-zinc-600 p-2 rounded-xl border-4 border-zinc-900 transition-colors"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>
          </div>

          {/* Buy Token */}
          <div className="bg-zinc-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-zinc-500">You receive</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0 text-2xl font-semibold text-zinc-300">
                {isLoading && sellAmount ? (
                  <span className="text-zinc-500">...</span>
                ) : (
                  formattedBuyAmount
                )}
              </div>
              <button
                onClick={() => setShowBuyTokenModal(true)}
                className="shrink-0 flex items-center gap-2 bg-zinc-700 hover:bg-zinc-600 px-3 py-2 rounded-xl transition-colors"
              >
                {buyToken ? (
                  <>
                    <div className="w-6 h-6 rounded-full bg-zinc-600 overflow-hidden">
                      {buyToken.logoUrl ? (
                        <img src={buyToken.logoUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="flex items-center justify-center h-full text-xs font-bold text-pink-500">
                          {buyToken.symbol.slice(0, 2)}
                        </span>
                      )}
                    </div>
                    <span className="font-semibold">{buyToken.symbol}</span>
                  </>
                ) : (
                  <span className="text-zinc-400">Select</span>
                )}
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              </button>
            </div>
          </div>

          {/* Price Info */}
          {sellToken && buyToken && sellAmount && parseFloat(sellAmount) > 0 && (
            <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Min. received</span>
                <span>
                  {priceQuote?.buyAmount
                    ? `${(parseFloat(formatBuyAmount(priceQuote.buyAmount, buyToken.decimals)) * (1 - slippage / 100)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${buyToken.symbol}`
                    : "—"
                  }
                </span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Slippage</span>
                <span>{slippage}% (auto)</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Fee</span>
                <span>0.4%</span>
              </div>
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="mt-4">
          <Button
            onClick={
              !isConnected
                ? handleConnect
                : needsApproval
                ? handleApprove
                : handleSwap
            }
            disabled={isConnected && (!canSwap || isPending)}
            className="w-full py-4 text-lg font-semibold rounded-xl bg-pink-500 hover:bg-pink-600 disabled:bg-zinc-700 disabled:text-zinc-500"
          >
            {buttonText}
          </Button>
        </div>

        {/* Success Message */}
        {swapSuccess && (
          <div className="mt-4 p-4 bg-green-500/20 border border-green-500/50 rounded-xl text-center">
            <span className="text-green-400 font-semibold">Swap successful!</span>
          </div>
        )}
      </div>

      <NavBar />

      {/* Modals */}
      <TokenSelectorModal
        isOpen={showSellTokenModal}
        onClose={() => setShowSellTokenModal(false)}
        onSelect={setSellToken}
        tokens={tokens}
        selectedToken={sellToken}
        otherToken={buyToken}
      />
      <TokenSelectorModal
        isOpen={showBuyTokenModal}
        onClose={() => setShowBuyTokenModal(false)}
        onSelect={setBuyToken}
        tokens={tokens}
        selectedToken={buyToken}
        otherToken={sellToken}
      />
    </main>
  );
}

export default function SwapPage() {
  return (
    <Suspense fallback={
      <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
        <div className="flex items-center justify-center h-full">
          <span className="text-zinc-500">Loading...</span>
        </div>
        <NavBar />
      </main>
    }>
      <SwapContent />
    </Suspense>
  );
}
