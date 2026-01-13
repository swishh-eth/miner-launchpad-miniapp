"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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

// 6 snap positions
type Position = "top-left" | "top-right" | "middle-left" | "middle-right" | "bottom-left" | "bottom-right";

const POSITIONS: Record<Position, { x: string; y: string }> = {
  "top-left": { x: "16px", y: "calc(env(safe-area-inset-top, 0px) + 60px)" },
  "top-right": { x: "calc(100% - 72px)", y: "calc(env(safe-area-inset-top, 0px) + 60px)" },
  "middle-left": { x: "16px", y: "50%" },
  "middle-right": { x: "calc(100% - 72px)", y: "50%" },
  "bottom-left": { x: "16px", y: "calc(100% - env(safe-area-inset-bottom, 0px) - 80px)" },
  "bottom-right": { x: "calc(100% - 72px)", y: "calc(100% - env(safe-area-inset-bottom, 0px) - 80px)" },
};

// Find nearest position based on coordinates
function findNearestPosition(x: number, y: number, windowWidth: number, windowHeight: number): Position {
  const midX = windowWidth / 2;
  const midY = windowHeight / 2;
  const topThreshold = windowHeight * 0.33;
  const bottomThreshold = windowHeight * 0.66;

  const isLeft = x < midX;
  
  if (y < topThreshold) {
    return isLeft ? "top-left" : "top-right";
  } else if (y > bottomThreshold) {
    return isLeft ? "bottom-left" : "bottom-right";
  } else {
    return isLeft ? "middle-left" : "middle-right";
  }
}

export function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const isRigPage = pathname.startsWith("/rig/");

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [position, setPosition] = useState<Position>("bottom-right");
  const [isDragging, setIsDragging] = useState(false);

  const activeIndex = NAV_ITEMS.findIndex((item) =>
    item.href === "/explore"
      ? pathname === "/explore" || isRigPage
      : pathname === item.href
  );

  const activeItem = NAV_ITEMS[activeIndex];
  const ActiveIcon = activeItem?.icon || Search;

  const handleNavClick = useCallback((href: string, index: number, e: React.MouseEvent) => {
    // If clicking on already active page, collapse the navbar
    if (index === activeIndex && !isCollapsed) {
      e.preventDefault();
      setIsCollapsed(true);
    }
  }, [activeIndex, isCollapsed]);

  const handleCollapsedClick = useCallback(() => {
    if (!isDragging) {
      setIsCollapsed(false);
    }
  }, [isDragging]);

  const handleDragEnd = useCallback((event: any, info: any) => {
    setIsDragging(false);
    const newPosition = findNearestPosition(
      info.point.x,
      info.point.y,
      window.innerWidth,
      window.innerHeight
    );
    setPosition(newPosition);
  }, []);

  // Expanded navbar (bottom center)
  if (!isCollapsed) {
    return (
      <>
        {/* Bottom fade gradient */}
        <div 
          className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none z-40"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)"
          }}
        />
        
        <nav
          className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{
            paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)",
          }}
        >
          <motion.div 
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex items-center gap-1 bg-black border border-purple-500/50 rounded-full px-2 py-2 shadow-lg shadow-purple-500/20 pointer-events-auto"
          >
            {NAV_ITEMS.map((item, index) => {
              const isActive = index === activeIndex;
              const isCenter = index === 1;
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={(e) => handleNavClick(item.href, index, e)}
                  className={cn(
                    "relative flex items-center justify-center rounded-full transition-all",
                    isCenter ? "p-3.5" : "p-3"
                  )}
                >
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
                  <motion.div
                    animate={{ scale: isActive ? 1.1 : 1 }}
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
          </motion.div>
        </nav>
      </>
    );
  }

  // Collapsed draggable button
  return (
    <>
      {/* Bottom fade gradient - still show when collapsed */}
      <div 
        className="fixed bottom-0 left-0 right-0 h-24 pointer-events-none z-40"
        style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)"
        }}
      />

      <motion.div
        drag
        dragMomentum={false}
        onDragStart={() => setIsDragging(true)}
        onDragEnd={handleDragEnd}
        initial={false}
        animate={{
          left: POSITIONS[position].x,
          top: POSITIONS[position].y,
        }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 30,
        }}
        onClick={handleCollapsedClick}
        className="fixed z-50 cursor-grab active:cursor-grabbing"
        style={{ transform: "translate(0, -50%)" }}
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.95 }}
          className="w-14 h-14 rounded-full bg-purple-500 flex items-center justify-center shadow-lg shadow-purple-500/30 border-2 border-purple-400"
        >
          <ActiveIcon className="w-6 h-6 text-black" />
        </motion.div>
      </motion.div>
    </>
  );
}