"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, useMotionValue, animate } from "framer-motion";
import { cn } from "@/lib/utils";
import { Search, Rocket, Gavel, User } from "lucide-react";

type NavItem = {
  href: "/auctions" | "/explore" | "/launch" | "/profile";
  icon: typeof Search;
  label: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/auctions", icon: Gavel, label: "Auctions" },
  { href: "/explore", icon: Search, label: "Explore" },
  { href: "/launch", icon: Rocket, label: "Launch" },
  { href: "/profile", icon: User, label: "Profile" },
];

type Position = "bottom-left" | "bottom-right";

export function NavBar() {
  const pathname = usePathname();
  const isRigPage = pathname.startsWith("/rig/");

  const [isExpanded, setIsExpanded] = useState(false);
  const [position, setPosition] = useState<Position>("bottom-right");
  const [mounted, setMounted] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const x = useMotionValue(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Find active index
  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/explore"
      ? pathname === "/explore" || isRigPage
      : pathname === item.href
  );

  const activeItem = NAV_ITEMS[activeIndex] || NAV_ITEMS[1];
  const ActiveIcon = activeItem.icon;

  const navItemsToShow = NAV_ITEMS.filter((_, index) => index !== activeIndex);

  const toggleExpanded = useCallback(() => {
    if (!isDragging) {
      setIsExpanded((prev) => !prev);
    }
  }, [isDragging]);

  const handleDragStart = useCallback(() => {
    setIsDragging(true);
  }, []);

  const handleDragEnd = useCallback(
    (event: any, info: any) => {
      const threshold = 50;

      if (position === "bottom-right" && info.offset.x < -threshold) {
        setPosition("bottom-left");
      } else if (position === "bottom-left" && info.offset.x > threshold) {
        setPosition("bottom-right");
      }

      animate(x, 0, { type: "spring", stiffness: 400, damping: 30 });

      setTimeout(() => setIsDragging(false), 100);
    },
    [position, x]
  );

  const isLeft = position === "bottom-left";

  // Don't render on rig pages or before mount
  if (!mounted || isRigPage) {
    return null;
  }

  return (
    <>
      {/* Bottom fade gradient */}
      <div
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none z-40"
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)",
        }}
      />

      {/* Nav container */}
      <div
        className={cn("fixed z-50", isLeft ? "left-4" : "right-4")}
        style={{
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
        }}
      >
        <div className="relative">
          {/* Expandable buttons - expand UPWARD */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.8 }}
                transition={{
                  type: "spring",
                  stiffness: 500,
                  damping: 35,
                }}
                className="absolute bottom-16 left-0 right-0 flex flex-col items-center gap-2 pb-2"
              >
                {navItemsToShow.map((item, index) => {
                  const Icon = item.icon;

                  return (
                    <motion.div
                      key={item.href}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: { delay: index * 0.05 },
                      }}
                      exit={{
                        opacity: 0,
                        y: 10,
                        transition: { delay: (navItemsToShow.length - index - 1) * 0.03 },
                      }}
                    >
                      <Link
                        href={item.href}
                        onClick={() => setIsExpanded(false)}
                        className="flex items-center justify-center w-12 h-12 rounded-full bg-zinc-900 border border-purple-500/30 shadow-lg shadow-black/30 transition-all hover:bg-zinc-800"
                      >
                        <Icon className="w-5 h-5 text-zinc-400" />
                      </Link>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main button (always visible) - draggable */}
          <motion.button
            drag="x"
            dragConstraints={{ left: isLeft ? 0 : -300, right: isLeft ? 300 : 0 }}
            dragElastic={0.1}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={toggleExpanded}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            style={{ x }}
            className="w-14 h-14 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30 border-2 border-purple-400 cursor-grab active:cursor-grabbing touch-none"
          >
            <ActiveIcon className="w-6 h-6 text-black" />
          </motion.button>
        </div>
      </div>
    </>
  );
}