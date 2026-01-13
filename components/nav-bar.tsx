"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel, Info, User } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

  // Check if we're on a rig detail page
  const isRigPage = pathname.startsWith("/rig/");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 backdrop-blur-md border-t border-zinc-900"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingTop: "12px",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-4">
        {/* Launch */}
        <Link
          href="/launch"
          className={cn(
            "flex flex-col items-center justify-center gap-1 p-2 transition-all",
            pathname === "/launch"
              ? "text-purple-500"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Rocket className="w-5 h-5" />
          <span className="text-[10px] font-medium">Launch</span>
        </Link>

        {/* Auctions */}
        <Link
          href="/auctions"
          className={cn(
            "flex flex-col items-center justify-center gap-1 p-2 transition-all",
            pathname === "/auctions"
              ? "text-purple-500"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Gavel className="w-5 h-5" />
          <span className="text-[10px] font-medium">Auctions</span>
        </Link>

        {/* Explore (center - primary) */}
        <Link
          href="/explore"
          className={cn(
            "flex flex-col items-center justify-center gap-1 p-3 -mt-4 transition-all rounded-2xl",
            pathname === "/explore" || isRigPage
              ? "bg-purple-500 text-black"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          )}
        >
          <Search className="w-6 h-6" />
          <span className="text-[10px] font-semibold">Explore</span>
        </Link>

        {/* Info */}
        <Link
          href="/info"
          className={cn(
            "flex flex-col items-center justify-center gap-1 p-2 transition-all",
            pathname === "/info"
              ? "text-purple-500"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <Info className="w-5 h-5" />
          <span className="text-[10px] font-medium">Info</span>
        </Link>

        {/* Profile */}
        <Link
          href="/profile"
          className={cn(
            "flex flex-col items-center justify-center gap-1 p-2 transition-all",
            pathname === "/profile"
              ? "text-purple-500"
              : "text-zinc-500 hover:text-zinc-300"
          )}
        >
          <User className="w-5 h-5" />
          <span className="text-[10px] font-medium">Profile</span>
        </Link>
      </div>
    </nav>
  );
}