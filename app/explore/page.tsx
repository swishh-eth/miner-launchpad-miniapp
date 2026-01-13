"use client";

import { useEffect, useState, useRef } from "react";
import { Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import { NavBar } from "@/components/nav-bar";
import { RigCard } from "@/components/rig-card";
import { useExploreRigs, type SortOption } from "@/hooks/useAllRigs";
import { useFarcaster } from "@/hooks/useFarcaster";
import { cn, getDonutPrice } from "@/lib/utils";
import {
  DEFAULT_DONUT_PRICE_USD,
  PRICE_REFETCH_INTERVAL_MS,
} from "@/lib/constants";

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "trending", label: "Bump" },
  { value: "top", label: "Top" },
  { value: "new", label: "New" },
];

export default function ExplorePage() {
  const [sortBy, setSortBy] = useState<SortOption>("trending");
  const [searchQuery, setSearchQuery] = useState("");
  const [donutUsdPrice, setDonutUsdPrice] = useState<number>(
    DEFAULT_DONUT_PRICE_USD
  );
  const [newBumpAddress, setNewBumpAddress] = useState<string | null>(null);
  const prevTopRigRef = useRef<string | null>(null);

  const { address } = useFarcaster();
  const { rigs, isLoading } = useExploreRigs(sortBy, searchQuery, address);

  // Track when a new rig bumps to the top
  useEffect(() => {
    if (sortBy !== "trending" || rigs.length === 0) {
      prevTopRigRef.current = null;
      setNewBumpAddress(null);
      return;
    }

    const currentTopRig = rigs[0].address;

    if (prevTopRigRef.current && prevTopRigRef.current !== currentTopRig) {
      setNewBumpAddress(currentTopRig);
      const timer = setTimeout(() => setNewBumpAddress(null), 2000);
      return () => clearTimeout(timer);
    }

    prevTopRigRef.current = currentTopRig;
  }, [rigs, sortBy]);

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

  return (
    <main className="flex h-screen w-screen justify-center overflow-hidden bg-black font-mono text-white">
      <div
        className="relative flex h-full w-full max-w-[520px] flex-1 flex-col overflow-hidden bg-black px-3"
        style={{
          paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)",
        }}
      >
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Header */}
          <div className="mb-3">
            <h1 className="text-xl font-bold tracking-wide">Explore</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Discover and mine tokens
            </p>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tokens..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/50 pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500/50 focus:bg-zinc-900 transition-all"
            />
          </div>

          {/* Sort Tabs */}
          <div className="flex gap-1 mb-3 p-1 bg-zinc-900/50 rounded-xl">
            {SORT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSortBy(option.value)}
                className={cn(
                  "flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all",
                  sortBy === option.value
                    ? "bg-purple-500 text-black shadow-lg shadow-purple-500/25"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {/* Rig List */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {isLoading ? (
              // Skeleton loaders
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-[72px] rounded-2xl bg-zinc-900/50 animate-pulse"
                  />
                ))}
              </div>
            ) : rigs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-zinc-500">
                <p className="text-base font-semibold">No tokens found</p>
                <p className="text-sm mt-1">
                  {searchQuery
                    ? "Try a different search"
                    : "Be the first to launch!"}
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                <motion.div className="space-y-2">
                  {rigs.map((rig, index) => (
                    <RigCard
                      key={rig.address}
                      rig={rig}
                      donutUsdPrice={donutUsdPrice}
                      rank={index + 1}
                      isKing={sortBy === "trending" && index === 0}
                      isNewBump={rig.address === newBumpAddress}
                    />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
            {/* Bottom spacer */}
            <div className="h-4" />
          </div>
        </div>
      </div>
      <NavBar />
    </main>
  );
}