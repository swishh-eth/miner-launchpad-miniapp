"use client";

import { useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatEther } from "viem";
import { useReadContract } from "wagmi";
import { sdk } from "@farcaster/miniapp-sdk";
import { Pickaxe, Coins, TrendingUp, ExternalLink } from "lucide-react";

import { NavBar } from "@/components/nav-bar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CONTRACT_ADDRESSES, CORE_ABI, ERC20_ABI } from "@/lib/contracts";
import { useFarcaster, getUserDisplayName, initialsFrom } from "@/hooks/useFarcaster";
import { getAccount, getUserRigAccounts } from "@/lib/subgraph-launchpad";
import {
  DEFAULT_CHAIN_ID,
  STALE_TIME_PROFILE_MS,
} from "@/lib/constants";

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  subValue?: string;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900">
      <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center">
        <Icon className="w-5 h-5 text-purple-500" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="font-semibold text-white">{value}</div>
        {subValue && <div className="text-xs text-zinc-600">{subValue}</div>}
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const readyRef = useRef(false);
  const { user, address, isConnected, connect } = useFarcaster();

  const displayName = getUserDisplayName(user);
  const avatarUrl = user?.pfpUrl ?? null;
  const username = user?.username ?? null;

  // Fetch user's DONUT balance
  const { data: donutTokenAddress } = useReadContract({
    address: CONTRACT_ADDRESSES.core as `0x${string}`,
    abi: CORE_ABI,
    functionName: "donutToken",
    chainId: DEFAULT_CHAIN_ID,
  });

  const { data: donutBalance } = useReadContract({
    address: donutTokenAddress as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: DEFAULT_CHAIN_ID,
    query: {
      enabled: !!donutTokenAddress && !!address,
    },
  });

  // Fetch user's account data from subgraph
  const { data: accountData } = useQuery({
    queryKey: ["account", address],
    queryFn: () => (address ? getAccount(address) : null),
    enabled: !!address,
    staleTime: STALE_TIME_PROFILE_MS,
  });

  // Fetch user's rig accounts
  const { data: rigAccounts } = useQuery({
    queryKey: ["rigAccounts", address],
    queryFn: () => (address ? getUserRigAccounts(address) : []),
    enabled: !!address,
    staleTime: STALE_TIME_PROFILE_MS,
  });

  // Calculate stats
  const stats = useMemo(() => {
    if (!rigAccounts) {
      return {
        totalMined: 0n,
        totalSpent: 0n,
        totalEarned: 0n,
        rigsParticipated: 0,
      };
    }

    let totalMined = 0n;
    let totalSpent = 0n;
    let totalEarned = 0n;

    for (const ra of rigAccounts) {
      totalMined += BigInt(ra.mined);
      totalSpent += BigInt(ra.spent);
      totalEarned += BigInt(ra.earned);
    }

    return {
      totalMined,
      totalSpent,
      totalEarned,
      rigsParticipated: rigAccounts.length,
    };
  }, [rigAccounts]);

  const formatBigInt = (value: bigint) => {
    const num = Number(formatEther(value));
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sdk.actions.ready().catch(() => {});
      }
    }, 1200);
    return () => clearTimeout(timeout);
  }, []);

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
          <div className="mb-4">
            <h1 className="text-2xl font-bold tracking-wide">PROFILE</h1>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide pb-32">
            {/* User Info */}
            <div className="flex items-center gap-4 mb-6">
              <Avatar className="h-16 w-16 border-2 border-purple-500">
                <AvatarImage
                  src={avatarUrl || undefined}
                  alt={displayName}
                  className="object-cover"
                />
                <AvatarFallback className="bg-zinc-800 text-white text-lg">
                  {initialsFrom(displayName)}
                </AvatarFallback>
              </Avatar>
              <div>
                <div className="font-bold text-lg">{displayName}</div>
                {username && (
                  <div className="text-sm text-zinc-500">@{username}</div>
                )}
                {address && (
                  <div className="text-xs text-zinc-600 font-mono">
                    {address.slice(0, 6)}...{address.slice(-4)}
                  </div>
                )}
              </div>
            </div>

            {!isConnected ? (
              <div className="flex flex-col items-center justify-center py-12">
                <p className="text-zinc-500 mb-4">Connect to view your profile</p>
                <button
                  onClick={() => connect()}
                  className="px-6 py-3 rounded-xl bg-purple-500 text-black font-semibold hover:bg-purple-400 transition-colors"
                >
                  Connect Wallet
                </button>
              </div>
            ) : (
              <>
                {/* DONUT Balance */}
                <div className="mb-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/20 to-purple-500/5 border border-purple-500/30">
                  <div className="text-xs text-zinc-400 mb-1">DONUT Balance</div>
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 rounded-full bg-black" />
                    </span>
                    <span className="text-2xl font-bold">
                      {donutBalance
                        ? formatBigInt(donutBalance as bigint)
                        : "0"}
                    </span>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <StatCard
                    icon={Pickaxe}
                    label="Rigs Mined"
                    value={stats.rigsParticipated.toString()}
                  />
                  <StatCard
                    icon={Coins}
                    label="Total Mined"
                    value={formatBigInt(stats.totalMined)}
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Total Spent"
                    value={`${formatBigInt(stats.totalSpent)} ETH`}
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Total Earned"
                    value={`${formatBigInt(stats.totalEarned)} ETH`}
                  />
                </div>

                {/* Rigs Launched */}
                {accountData?.rigsLaunched && accountData.rigsLaunched.length > 0 && (
                  <div className="mb-4">
                    <h2 className="text-sm font-semibold text-zinc-400 mb-2">
                      FRANCHISES LAUNCHED
                    </h2>
                    <div className="space-y-2">
                      {accountData.rigsLaunched.map((rig) => (
                        <div
                          key={rig.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-zinc-900"
                        >
                          <div>
                            <div className="font-semibold">{rig.tokenName}</div>
                            <div className="text-sm text-zinc-500">
                              {rig.tokenSymbol}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-purple-500">
                              {formatBigInt(BigInt(rig.minted))} mined
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
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