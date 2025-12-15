"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel } from "lucide-react";

export function NavBar() {
  const pathname = usePathname();

  // Check if we're on a rig detail page
  const isRigPage = pathname.startsWith("/rig/");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingTop: "12px",
      }}
    >
      <div className="flex justify-around items-center max-w-[520px] mx-auto px-8">
        <Link
          href="/explore"
          className={cn(
            "flex items-center justify-center p-3 transition-colors rounded-full",
            pathname === "/explore" || isRigPage
              ? "text-pink-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Search className="w-6 h-6" />
        </Link>

        <Link
          href="/launch"
          className={cn(
            "flex items-center justify-center p-3 transition-colors rounded-full",
            pathname === "/launch"
              ? "text-pink-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Rocket className="w-6 h-6" />
        </Link>

        <Link
          href="/auctions"
          className={cn(
            "flex items-center justify-center p-3 transition-colors rounded-full",
            pathname === "/auctions"
              ? "text-pink-500"
              : "text-gray-500 hover:text-gray-300"
          )}
        >
          <Gavel className="w-6 h-6" />
        </Link>
      </div>
    </nav>
  );
}
