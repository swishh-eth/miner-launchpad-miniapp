"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import { parseEther, formatEther, type Address, encodeFunctionData } from "viem";
import { Upload, X, Plus, Minus } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/nav-bar";
import {
  CONTRACT_ADDRESSES,
  MULTICALL_ABI,
  CORE_ABI,
  ERC20_ABI,
  LAUNCH_DEFAULTS,
} from "@/lib/contracts";
import { getDonutPrice } from "@/lib/utils";
import { useFarcaster, getUserDisplayName, getUserHandle, initialsFrom } from "@/hooks/useFarcaster";
import { useBatchedTransaction, encodeApproveCall, type Call } from "@/hooks/useBatchedTransaction";
import { DEFAULT_CHAIN_ID, DEFAULT_DONUT_PRICE_USD, PRICE_REFETCH_INTERVAL_MS, STALE_TIME_SHORT_MS } from "@/lib/constants";

// Animated dots component for loading state
function LoadingDots() {
  return (
    <span className="inline-flex">
      <span className="animate-[bounce_1s_infinite_0ms]">.</span>
      <span className="animate-[bounce_1s_infinite_200ms]">.</span>
      <span className="animate-[bounce_1s_infinite_400ms]">.</span>
    </span>
  );
}

export default function LaunchPage() {
  const router = useRouter();

  // Form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [defaultMessage, setDefaultMessage] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [txStep, setTxStep] = useState<"idle" | "uploading" | "launching">("idle");

  // Fixed 1 DONUT fee
  const donutAmountBigInt = parseEther("1");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(DEFAULT_DONUT_PRICE_USD);
  const [launchResult, setLaunchResult] = useState<
    "success" | "failure" | null
  >(null);
  const launchResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Farcaster context and wallet connection
  const { user, address, isConnected, connect } = useFarcaster();

  // Batched transaction hook for approve + launch
  const {
    execute: executeBatch,
    state: batchState,
    reset: resetBatch,
  } = useBatchedTransaction();

  // Get DONUT token address from Core
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

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (launchResultTimeoutRef.current) {
        clearTimeout(launchResultTimeoutRef.current);
      }
    };
  }, []);

  const resetLaunchResult = useCallback(() => {
    if (launchResultTimeoutRef.current) {
      clearTimeout(launchResultTimeoutRef.current);
      launchResultTimeoutRef.current = null;
    }
    setLaunchResult(null);
  }, []);

  const showLaunchResult = useCallback((result: "success" | "failure") => {
    if (launchResultTimeoutRef.current) {
      clearTimeout(launchResultTimeoutRef.current);
    }
    setLaunchResult(result);
    launchResultTimeoutRef.current = setTimeout(() => {
      setLaunchResult(null);
      launchResultTimeoutRef.current = null;
    }, 3000);
  }, []);

  // Handle batched transaction result
  useEffect(() => {
    if (batchState === "success") {
      showLaunchResult("success");
      setTxStep("idle");
      resetBatch();
      setTimeout(() => {
        router.push("/explore");
      }, 2000);
    } else if (batchState === "error") {
      showLaunchResult("failure");
      setTxStep("idle");
      resetBatch();
    }
  }, [batchState, showLaunchResult, resetBatch, router]);

  // Handle logo selection (just preview, don't upload yet)
  const handleLogoSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("Image must be less than 5MB");
        return;
      }

      // Store file and show preview
      setLogoFile(file);
      const previewUrl = URL.createObjectURL(file);
      setLogoPreview(previewUrl);
    },
    []
  );

  // Upload logo to IPFS
  const uploadLogo = useCallback(async (): Promise<string | null> => {
    if (!logoFile) return null;

    try {
      const formData = new FormData();
      formData.append("file", logoFile);
      if (tokenSymbol.trim()) {
        formData.append("tokenSymbol", tokenSymbol.trim().toUpperCase());
      }

      const response = await fetch("/api/pinata/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      return data.ipfsUrl;
    } catch (error) {
      console.error("Logo upload failed:", error);
      return null;
    }
  }, [logoFile, tokenSymbol]);

  const removeLogo = useCallback(() => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const addLink = useCallback(() => {
    setLinks((prev) => [...prev, ""]);
  }, []);

  const removeLink = useCallback((index: number) => {
    setLinks((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateLink = useCallback((index: number, value: string) => {
    setLinks((prev) => prev.map((link, i) => (i === index ? value : link)));
  }, []);

  const userDonutBalance = donutBalance as bigint | undefined;

  const validationError = useMemo(() => {
    if (!tokenName.trim()) return "Token name is required";
    if (!tokenSymbol.trim()) return "Token symbol is required";
    if (tokenSymbol.length > 10) return "Symbol must be 10 characters or less";
    if (userDonutBalance !== undefined && donutAmountBigInt > userDonutBalance) {
      return "Insufficient DONUT balance (need 1 DONUT)";
    }
    return null;
  }, [tokenName, tokenSymbol, donutAmountBigInt, userDonutBalance]);

  // Upload metadata to IPFS
  const uploadMetadata = useCallback(async (imageUri: string): Promise<string | null> => {
    try {
      // Filter out empty links
      const validLinks = links.filter((link) => link.trim() !== "");

      const response = await fetch("/api/pinata/metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tokenName.trim(),
          symbol: tokenSymbol.trim().toUpperCase(),
          image: imageUri,
          description: tokenDescription.trim(),
          defaultMessage: defaultMessage.trim() || "gm",
          links: validLinks,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to upload metadata");
      }

      const data = await response.json();
      return data.ipfsUrl;
    } catch (error) {
      console.error("Metadata upload failed:", error);
      return null;
    }
  }, [tokenName, tokenSymbol, tokenDescription, defaultMessage, links]);

  const handleLaunch = useCallback(async () => {
    resetLaunchResult();

    let targetAddress = address;
    if (!targetAddress) {
      try {
        targetAddress = await connect();
      } catch {
        showLaunchResult("failure");
        return;
      }
    }

    if (!donutTokenAddress) {
      showLaunchResult("failure");
      return;
    }

    setTxStep("uploading");

    // Upload image first (if any)
    let imageUri = "";
    if (logoFile) {
      const uploadedImageUri = await uploadLogo();
      if (!uploadedImageUri) {
        showLaunchResult("failure");
        setTxStep("idle");
        return;
      }
      imageUri = uploadedImageUri;
    }

    // Then upload metadata
    const uploadedMetadataUri = await uploadMetadata(imageUri);
    if (!uploadedMetadataUri) {
      showLaunchResult("failure");
      setTxStep("idle");
      return;
    }

    setTxStep("launching");

    // Create batched calls: approve + launch
    const approveCall = encodeApproveCall(
      donutTokenAddress as Address,
      CONTRACT_ADDRESSES.multicall as Address,
      donutAmountBigInt
    );

    // Encode launch call
    const launchParams = {
      ...LAUNCH_DEFAULTS,
      launcher: targetAddress,
      tokenName: tokenName.trim(),
      tokenSymbol: tokenSymbol.trim().toUpperCase(),
      unitUri: uploadedMetadataUri,
      donutAmount: donutAmountBigInt,
    };

    const launchCallData = encodeFunctionData({
      abi: MULTICALL_ABI,
      functionName: "launch",
      args: [launchParams],
    });

    const launchCall: Call = {
      to: CONTRACT_ADDRESSES.multicall as Address,
      data: launchCallData,
    };

    try {
      await executeBatch([approveCall, launchCall]);
    } catch (error) {
      console.error("Launch failed:", error);
      showLaunchResult("failure");
      setTxStep("idle");
      resetBatch();
    }
  }, [
    address,
    connect,
    donutTokenAddress,
    donutAmountBigInt,
    logoFile,
    tokenName,
    tokenSymbol,
    resetLaunchResult,
    showLaunchResult,
    uploadLogo,
    uploadMetadata,
    executeBatch,
    resetBatch,
  ]);

  const isLaunching = txStep !== "idle" || batchState === "pending" || batchState === "confirming";

  const isLaunchDisabled =
    !!validationError ||
    isLaunching ||
    launchResult !== null ||
    !isConnected;

  const userDisplayName = getUserDisplayName(user);
  const userHandle = getUserHandle(user);
  const userAvatarUrl = user?.pfpUrl ?? null;

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden rounded-[28px] bg-black px-2 shadow-inner"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 72px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-2xl font-bold tracking-wide">LAUNCH</h1>
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

          {/* Launch Form */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
              {/* Logo + Name/Symbol Row */}
              <div className="flex gap-3">
                {/* Token Logo Upload */}
                <div className="flex-shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />
                  {logoPreview ? (
                    <div className="relative w-[84px] h-[84px]">
                      <img
                        src={logoPreview}
                        alt="Token logo preview"
                        className="w-[84px] h-[84px] rounded-lg object-cover bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="absolute top-1 right-1 w-5 h-5 bg-zinc-700/80 rounded-full flex items-center justify-center hover:bg-zinc-600 transition-colors"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-[84px] h-[84px] rounded-lg bg-zinc-900 flex flex-col items-center justify-center gap-1 hover:bg-zinc-800 transition-colors border border-zinc-800 border-dashed"
                    >
                      <Upload className="w-5 h-5 text-zinc-600" />
                      <span className="text-[10px] text-zinc-600 font-medium">Logo</span>
                    </button>
                  )}
                </div>

                {/* Name and Symbol */}
                <div className="flex-1 flex flex-col gap-2">
                  {/* Token Name */}
                  <input
                    type="text"
                    value={tokenName}
                    onChange={(e) => setTokenName(e.target.value)}
                    placeholder="Token Name"
                    maxLength={50}
                    className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none border border-zinc-800"
                  />

                  {/* Token Symbol */}
                  <input
                    type="text"
                    value={tokenSymbol}
                    onChange={(e) =>
                      setTokenSymbol(e.target.value.toUpperCase())
                    }
                    placeholder="SYMBOL"
                    maxLength={10}
                    className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none border border-zinc-800 uppercase"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="mt-3">
                <label className="text-[10px] text-zinc-500 mb-1 block">Description</label>
                <textarea
                  value={tokenDescription}
                  onChange={(e) => setTokenDescription(e.target.value)}
                  placeholder="Tell people about your token..."
                  maxLength={280}
                  rows={2}
                  className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none border border-zinc-800 resize-none"
                />
                <div className="text-[9px] text-zinc-600 text-right">{tokenDescription.length}/280</div>
              </div>

              {/* Default Message */}
              <div className="mt-2">
                <label className="text-[10px] text-zinc-500 mb-1 block">Default mine message</label>
                <input
                  type="text"
                  value={defaultMessage}
                  onChange={(e) => setDefaultMessage(e.target.value)}
                  placeholder="gm"
                  maxLength={100}
                  className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none border border-zinc-800"
                />
              </div>

              {/* Links Section */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] text-zinc-500">Links</label>
                  <button
                    type="button"
                    onClick={addLink}
                    className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors"
                  >
                    <Plus className="w-3 h-3 text-zinc-400" />
                  </button>
                </div>
                <div className="space-y-2">
                  {links.map((link, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <input
                        type="url"
                        value={link}
                        onChange={(e) => updateLink(index, e.target.value)}
                        placeholder="https://"
                        className="flex-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white placeholder-zinc-600 focus:outline-none border border-zinc-800"
                      />
                      <button
                        type="button"
                        onClick={() => removeLink(index)}
                        className="w-5 h-5 rounded bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition-colors flex-shrink-0"
                      >
                        <Minus className="w-3 h-3 text-zinc-400" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
          </div>

          {/* Spacer for bottom bar */}
          <div className="h-24" />
        </div>

        {/* Fixed Bottom Action Bar */}
        <div className="fixed bottom-0 left-0 right-0 bg-black/95 backdrop-blur-sm">
          <div className="max-w-[520px] mx-auto px-2 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+72px)]">
            <div className="flex items-center justify-between gap-4">
              {/* Launch Fee */}
              <div className="flex-1">
                <div className="text-xs text-zinc-500 mb-1">Launch fee</div>
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-5 h-5 rounded-full bg-pink-500 flex items-center justify-center">
                    <span className="w-2 h-2 rounded-full bg-black" />
                  </span>
                  <span className="text-lg font-semibold text-white">1</span>
                </div>
                <div className="text-xs text-zinc-600">~${donutUsdPrice.toFixed(2)}</div>
              </div>

              {/* Balance and Button */}
              <div className="text-right">
                <div className="flex items-center justify-end gap-1 text-[10px] text-zinc-500 mb-1">
                  <span>Balance:</span>
                  <span className="inline-block w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-black" />
                  </span>
                  <span className="text-white font-medium">
                    {userDonutBalance
                      ? Number(formatEther(userDonutBalance)).toLocaleString(undefined, {
                          maximumFractionDigits: 2,
                        })
                      : "0"}
                  </span>
                </div>
                <Button
                  className="w-[calc(50vw-16px)] max-w-[244px] py-2.5 text-sm font-semibold rounded-lg bg-pink-500 hover:bg-pink-600 text-black transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={handleLaunch}
                  disabled={isLaunchDisabled}
                >
                  {launchResult === "success" ? (
                    "SUCCESS!"
                  ) : launchResult === "failure" ? (
                    "FAILED"
                  ) : txStep === "uploading" ? (
                    <>UPLOADING<LoadingDots /></>
                  ) : txStep === "launching" || batchState === "pending" || batchState === "confirming" ? (
                    <>LAUNCHING<LoadingDots /></>
                  ) : (
                    "LAUNCH"
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
