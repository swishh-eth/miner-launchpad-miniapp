"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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

type Position = "bottom-left" | "bottom-right";

export function NavBar() {
  const pathname = usePathname();
  const isRigPage = pathname.startsWith("/rig/");

  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState<Position>("bottom-right");
  const [mounted, setMounted] = useState(false);
  const [screenWidth, setScreenWidth] = useState(0);

  // Only run on client
  useEffect(() => {
    setMounted(true);
    setScreenWidth(window.innerWidth);

    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/explore"
      ? pathname === "/explore" || isRigPage
      : pathname === item.href
  );

  const activeItem = NAV_ITEMS[activeIndex];
  const ActiveIcon = activeItem?.icon || Search;

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleDragEnd = useCallback(
    (event: MouseEvent | TouchEvent | PointerEvent, info: { point: { x: number; y: number } }) => {
      if (screenWidth === 0) return;
      const screenMidpoint = screenWidth / 2;
      const newPosition = info.point.x < screenMidpoint ? "bottom-left" : "bottom-right";
      setPosition(newPosition);
      setIsExpanded(false);
    },
    [screenWidth]
  );

  const isLeft = position === "bottom-left";

  // Don't render until mounted (client-side)
  if (!mounted) {
    return null;
  }

  return (
    <>
      {/* Bottom fade gradient */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none z-40"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
        }}
      />

      {/* Nav container */}
      <div
        className={cn(
          "fixed z-50 flex items-center",
          isLeft ? "left-4 flex-row" : "right-4 flex-row-reverse"
        )}
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        <div className={cn("flex items-center gap-1", isLeft ? "flex-row" : "flex-row-reverse")}>
          {/* Expandable buttons */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ width: 0, opacity: 0, scale: 0.8 }}
                animate={{ width: "auto", opacity: 1, scale: 1 }}
                exit={{ width: 0, opacity: 0, scale: 0.8 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
                className={cn(
                  "flex items-center overflow-hidden bg-black/90 backdrop-blur-sm border border-purple-500/50 rounded-full px-1 py-1",
                  isLeft ? "flex-row ml-2" : "flex-row-reverse mr-2"
                )}
              >
                {NAV_ITEMS.map((item, index) => {
                  const isActive = index === activeIndex;
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsExpanded(false)}
                      className="relative flex items-center justify-center p-3 rounded-full"
                    >
                      {isActive && (
                        <motion.div
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-full bg-purple-500"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}
                      <Icon
                        className={cn(
                          "w-5 h-5 relative z-10 transition-colors",
                          isActive ? "text-black" : "text-zinc-400"
                        )}
                      />
                    </Link>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main button (always visible) - draggable */}
          <motion.button
            drag
            dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
            onClick={toggleExpanded}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30 border-2 border-purple-400 cursor-grab active:cursor-grabbing touch-none"
          >
            <ActiveIcon className="w-6 h-6 text-black" />
          </motion.button>
        </div>
      </div>
    </>
  );
}