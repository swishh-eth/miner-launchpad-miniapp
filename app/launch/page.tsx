"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sdk } from "@farcaster/miniapp-sdk";
import {
  useAccount,
  useConnect,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { parseEther, formatEther, type Address } from "viem";
import { Upload, X, Loader2, Plus, Minus } from "lucide-react";

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

type MiniAppContext = {
  user?: {
    fid: number;
    username?: string;
    displayName?: string;
    pfpUrl?: string;
  };
};

const initialsFrom = (label?: string) => {
  if (!label) return "";
  const stripped = label.replace(/[^a-zA-Z0-9]/g, "");
  if (!stripped) return label.slice(0, 2).toUpperCase();
  return stripped.slice(0, 2).toUpperCase();
};

export default function LaunchPage() {
  const router = useRouter();
  const readyRef = useRef(false);
  const autoConnectAttempted = useRef(false);
  const [context, setContext] = useState<MiniAppContext | null>(null);

  // Form state
  const [tokenName, setTokenName] = useState("");
  const [tokenSymbol, setTokenSymbol] = useState("");
  const [tokenDescription, setTokenDescription] = useState("");
  const [defaultMessage, setDefaultMessage] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [txStep, setTxStep] = useState<"idle" | "approving" | "uploading" | "launching">(
    "idle"
  );
  const [metadataUri, setMetadataUri] = useState("");

  // Fixed 1 DONUT fee
  const donutAmountBigInt = parseEther("1");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(0.001);
  const [launchResult, setLaunchResult] = useState<
    "success" | "failure" | null
  >(null);
  const launchResultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Wallet connection
  const { address, isConnected } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const primaryConnector = connectors[0];

  // Get DONUT token address from Core
  const { data: donutTokenAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "donutToken",
    chainId: base.id,
  });

  // Get user's DONUT balance
  const { data: donutBalance } = useReadContract({
    address: donutTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: !!donutTokenAddress && !!address,
      refetchInterval: 10_000,
    },
  });

  // Get user's DONUT allowance
  const { data: donutAllowance, refetch: refetchAllowance } = useReadContract({
    address: donutTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address
      ? [address, CONTRACT_ADDRESSES.multicall as `0x${string}`]
      : undefined,
    chainId: base.id,
    query: {
      enabled: !!donutTokenAddress && !!address,
    },
  });

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

  // Fetch DONUT price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getDonutPrice();
      setDonutUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, 60_000);
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

  // Handle receipt
  useEffect(() => {
    if (!receipt) return;

    if (receipt.status === "reverted") {
      showLaunchResult("failure");
      setTxStep("idle");
      resetWrite();
      return;
    }

    if (receipt.status === "success") {
      if (txStep === "approving") {
        // Approval succeeded, now launch
        resetWrite();
        refetchAllowance();
        setTxStep("launching");
        return;
      }

      if (txStep === "launching") {
        // Launch succeeded!
        showLaunchResult("success");
        setTxStep("idle");
        // Try to extract the new rig address from logs and redirect
        // For now, just redirect to explore
        setTimeout(() => {
          router.push("/explore");
        }, 2000);
        return;
      }
    }
    return;
  }, [receipt, txStep, resetWrite, refetchAllowance, showLaunchResult, router]);

  // Auto-trigger approval or launch after metadata upload
  useEffect(() => {
    if ((txStep === "approving" || txStep === "launching") && !isWriting && !isConfirming && !txHash) {
      handleLaunchStep();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [txStep, isWriting, isConfirming, txHash]);

  const userDonutBalance = donutBalance as bigint | undefined;
  const userAllowance = donutAllowance as bigint | undefined;

  const needsApproval =
    userAllowance !== undefined && donutAmountBigInt > userAllowance;

  const validationError = useMemo(() => {
    if (!tokenName.trim()) return "Token name is required";
    if (!tokenSymbol.trim()) return "Token symbol is required";
    if (tokenSymbol.length > 10) return "Symbol must be 10 characters or less";
    if (userDonutBalance !== undefined && donutAmountBigInt > userDonutBalance) {
      return "Insufficient DONUT balance (need 1 DONUT)";
    }
    return null;
  }, [tokenName, tokenSymbol, donutAmountBigInt, userDonutBalance]);

  const handleLaunchStep = useCallback(async () => {
    if (!address || !donutTokenAddress) return;

    try {
      if (txStep === "approving") {
        // Need to approve first
        await writeContract({
          account: address as Address,
          address: donutTokenAddress as Address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [
            CONTRACT_ADDRESSES.multicall as Address,
            donutAmountBigInt,
          ],
          chainId: base.id,
        });
        return;
      }

      // Launch the rig
      const launchParams = {
        ...LAUNCH_DEFAULTS,
        launcher: address,
        tokenName: tokenName.trim(),
        tokenSymbol: tokenSymbol.trim().toUpperCase(),
        unitUri: metadataUri,
        donutAmount: donutAmountBigInt,
        teamAddress: address, // Default to launcher
      };

      await writeContract({
        account: address as Address,
        address: CONTRACT_ADDRESSES.multicall as Address,
        abi: MULTICALL_ABI,
        functionName: "launch",
        args: [launchParams],
        chainId: base.id,
      });
    } catch (error) {
      console.error("Launch failed:", error);
      showLaunchResult("failure");
      setTxStep("idle");
      resetWrite();
    }
  }, [
    address,
    donutTokenAddress,
    txStep,
    donutAmountBigInt,
    tokenName,
    tokenSymbol,
    metadataUri,
    writeContract,
    showLaunchResult,
    resetWrite,
  ]);

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
      if (!primaryConnector) {
        showLaunchResult("failure");
        return;
      }
      try {
        const result = await connectAsync({
          connector: primaryConnector,
          chainId: base.id,
        });
        targetAddress = result.accounts[0];
      } catch {
        showLaunchResult("failure");
        return;
      }
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
    setMetadataUri(uploadedMetadataUri);

    if (needsApproval) {
      setTxStep("approving");
    } else {
      setTxStep("launching");
    }
  }, [
    address,
    connectAsync,
    logoFile,
    needsApproval,
    primaryConnector,
    resetLaunchResult,
    showLaunchResult,
    uploadLogo,
    uploadMetadata,
  ]);

  const buttonLabel = useMemo(() => {
    if (launchResult === "success") return "SUCCESS!";
    if (launchResult === "failure") return "FAILED";
    if (txStep === "uploading") return "UPLOADING...";
    if (isWriting || isConfirming) {
      if (txStep === "approving") return "APPROVING...";
      if (txStep === "launching") return "LAUNCHING...";
      return "PROCESSING...";
    }
    return "LAUNCH";
  }, [launchResult, isConfirming, isWriting, txStep]);

  const isLaunchDisabled =
    !!validationError ||
    isWriting ||
    isConfirming ||
    txStep !== "idle" ||
    launchResult !== null ||
    !isConnected;

  const userDisplayName =
    context?.user?.displayName ?? context?.user?.username ?? "Farcaster user";
  const userHandle = context?.user?.username
    ? `@${context.user.username}`
    : context?.user?.fid
      ? `fid ${context.user.fid}`
      : "";
  const userAvatarUrl = context?.user?.pfpUrl ?? null;

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
            {context?.user ? (
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
                        className="w-[84px] h-[84px] rounded-lg object-contain bg-zinc-900"
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-700 rounded-full flex items-center justify-center hover:bg-zinc-600 transition-colors"
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
                  {buttonLabel}
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
