"use client";

import { useEffect, useState, useRef } from "react";
import { Search } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NavBar } from "@/components/nav-bar";
import { RigCard } from "@/components/rig-card";
import { useExploreRigs, type SortOption } from "@/hooks/useAllRigs";
import { useFarcaster, getUserDisplayName, getUserHandle, initialsFrom } from "@/hooks/useFarcaster";
import { cn, getEthPrice } from "@/lib/utils";
import { DEFAULT_ETH_PRICE_USD, PRICE_REFETCH_INTERVAL_MS } from "@/lib/constants";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Bump" },
  { value: "top", label: "Top" },
  { value: "new", label: "New" },
];

export default function ExplorePage() {
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [ethUsdPrice, setEthUsdPrice] = useState<number>(DEFAULT_ETH_PRICE_USD);
  const [newBumpAddress, setNewBumpAddress] = useState<string | null>(null);
  const prevTopRigRef = useRef<string | null>(null);

  // Farcaster context and wallet connection
  const { user, address } = useFarcaster();

  // Get rigs data
  const { rigs, isLoading } = useExploreRigs(sortBy, searchQuery, address);

  // Track when a new rig bumps to the top
  useEffect(() => {
    if (sortBy !== "trending" || rigs.length === 0) {
      prevTopRigRef.current = null;
      setNewBumpAddress(null);
      return;
    }

    const currentTopRig = rigs[0].address;

    // If this is a different rig than before, it's a new bump
    if (prevTopRigRef.current && prevTopRigRef.current !== currentTopRig) {
      setNewBumpAddress(currentTopRig);
      // Clear the "new" animation after it plays
      const timer = setTimeout(() => {
        setNewBumpAddress(null);
      }, 3000);
      return () => clearTimeout(timer);
    }

    prevTopRigRef.current = currentTopRig;
  }, [rigs, sortBy]);

  // Fetch ETH price
  useEffect(() => {
    const fetchPrice = async () => {
      const price = await getEthPrice();
      setEthUsdPrice(price);
    };
    fetchPrice();
    const interval = setInterval(fetchPrice, PRICE_REFETCH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const userDisplayName = getUserDisplayName(user);
  const userHandle = getUserHandle(user);
  const userAvatarUrl = user?.pfpUrl ?? null;

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
            <h1 className="text-2xl font-bold tracking-wide">EXPLORE</h1>
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

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, symbol, or address..."
              className="w-full rounded-lg border border-zinc-800 bg-zinc-950 pl-10 pr-4 py-2.5 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-zinc-600"
            />
          </div>

          {/* Sort Tabs */}
          <div className="flex gap-1 mb-3">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-lg text-sm font-semibold transition-colors",
                  sortBy === option.value
                    ? "bg-pink-500 text-black"
                    : "bg-zinc-900 text-gray-400 hover:text-white"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Rig List */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {isLoading ? null : rigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                <p className="text-lg font-semibold">No rigs found</p>
                <p className="text-sm mt-1">
                  {searchQuery
                    ? "Try a different search term"
                    : "Be the first to launch a rig!"}
                </p>
              </div>
            ) : (
              rigs.map((rig, index) => (
                <RigCard
                  key={rig.address}
                  rig={rig}
                  ethUsdPrice={ethUsdPrice}
                  isTopBump={sortBy === "trending" && index === 0}
                  isNewBump={rig.address === newBumpAddress}
                />
              ))
            )}
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}
