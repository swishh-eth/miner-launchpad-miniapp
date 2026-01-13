"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel, Info, User } from "lucide-react";

const NAV_ITEMS = [
  { href: "/launch", icon: Rocket, label: "Launch" },
  { href: "/auctions", icon: Gavel, label: "Auctions" },
  { href: "/explore", icon: Search, label: "Explore", isCenter: true },
  { href: "/info", icon: Info, label: "Info" },
  { href: "/profile", icon: User, label: "Profile" },
];

export function NavBar() {
  const pathname = usePathname();
  const isRigPage = pathname.startsWith("/rig/");

  // Determine active index
  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/explore"
      ? pathname === "/explore" || isRigPage
      : pathname === item.href
  );

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-md"
      style={{
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)",
        paddingTop: "12px",
      }}
    >
      <div className="relative flex justify-around items-center max-w-[520px] mx-auto px-4">
        {NAV_ITEMS.map((item, index) => {
          const isActive = index === activeIndex;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative flex items-center justify-center p-3 z-10"
            >
              {/* Animated background circle */}
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className={cn(
                    "absolute inset-0 rounded-full",
                    item.isCenter
                      ? "bg-purple-500"
                      : "bg-zinc-800"
                  )}
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
                  scale: isActive ? 1.15 : 1,
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
                    "w-5 h-5 transition-colors",
                    isActive
                      ? item.isCenter
                        ? "text-black"
                        : "text-white"
                      : "text-zinc-500"
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