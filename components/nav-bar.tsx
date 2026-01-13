"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel } from "lucide-react";

type NavItem = {
  href: "/auctions" | "/explore" | "/launch";
  icon: typeof Search;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/auctions", icon: Gavel },
  { href: "/explore", icon: Search },
  { href: "/launch", icon: Rocket },
];

export function NavBar() {
  const pathname = usePathname();
  const isRigPage = pathname.startsWith("/rig/");

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/explore"
      ? pathname === "/explore" || isRigPage
      : pathname === item.href
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex justify-center"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      {/* Pill container */}
      <div className="flex items-center gap-1 bg-black border border-zinc-800 rounded-full px-2 py-2 shadow-lg shadow-black/50">
        {NAV_ITEMS.map((item, index) => {
          const isActive = index === activeIndex;
          const isCenter = index === 1; // Explore is center
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center justify-center rounded-full transition-all",
                isCenter ? "p-3.5" : "p-3"
              )}
            >
              {/* Animated background */}
              {isActive && (
                <motion.div
                  layoutId="nav-pill"
                  className="absolute inset-0 rounded-full bg-purple-500"
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 30,
                  }}
                />
              )}
              {/* Icon */}
              <motion.div
                animate={{
                  scale: isActive ? 1.1 : 1,
                }}
                transition={{
                  type: "spring",
                  stiffness: 400,
                  damping: 25,
                }}
                className="relative z-10"
              >
                <Icon
                  className={cn(
                    "transition-colors",
                    isCenter ? "w-6 h-6" : "w-5 h-5",
                    isActive ? "text-black" : "text-zinc-500"
                  )}
                />
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}