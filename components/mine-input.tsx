"use client";

import { formatEther, formatUnits } from "viem";
import { Button } from "@/components/ui/button";
import type { RigState } from "@/lib/contracts";
import type { UserRigStats } from "@/hooks/useUserRigStats";

const TOKEN_DECIMALS = 18;

type MineInputProps = {
  rigState: RigState | undefined;
  userStats: UserRigStats | null | undefined;
  tokenSymbol: string;
  ethUsdPrice: number;
  customMessage: string;
  onMessageChange: (message: string) => void;
  onMine: () => void;
  isDisabled: boolean;
  buttonLabel: string;
};

const formatTokenAmount = (
  value: bigint,
  decimals: number,
  maximumFractionDigits = 2
) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatUnits(value, decimals));
  if (!Number.isFinite(asNumber)) {
    return formatUnits(value, decimals);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

const formatEth = (value: bigint, maximumFractionDigits = 4) => {
  if (value === 0n) return "0";
  const asNumber = Number(formatEther(value));
  if (!Number.isFinite(asNumber)) {
    return formatEther(value);
  }
  return asNumber.toLocaleString(undefined, {
    maximumFractionDigits,
  });
};

export function MineInput({
  rigState,
  userStats,
  tokenSymbol,
  ethUsdPrice,
  customMessage,
  onMessageChange,
  onMine,
  isDisabled,
  buttonLabel,
}: MineInputProps) {
  const priceUsd = rigState
    ? Number(formatEther(rigState.price)) * ethUsdPrice
    : 0;

  return (
    <div className="border-t border-zinc-800 bg-black pt-2 pb-1 px-2">
      {/* User Balances Row */}
      <div className="flex justify-between mb-2 text-[10px]">
        {/* Unit Balance + Mined */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">{tokenSymbol}:</span>
            <span className="text-white font-medium">
              {rigState?.unitBalance
                ? formatTokenAmount(rigState.unitBalance, TOKEN_DECIMALS, 2)
                : "0"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Mined:</span>
            <span className="text-white font-medium">
              {userStats?.totalMined
                ? formatTokenAmount(userStats.totalMined, TOKEN_DECIMALS, 2)
                : "0"}
            </span>
          </div>
        </div>

        {/* ETH Balance + Spent */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">ETH:</span>
            <span className="text-white font-medium">
              {rigState?.ethBalance ? formatEth(rigState.ethBalance, 4) : "0"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Spent:</span>
            <span className="text-white font-medium">
              {userStats?.totalSpent
                ? formatEth(userStats.totalSpent, 4)
                : "0"}
            </span>
          </div>
        </div>

        {/* WETH Balance + Earned */}
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1">
            <span className="text-gray-500">WETH:</span>
            <span className="text-white font-medium">
              {rigState?.wethBalance ? formatEth(rigState.wethBalance, 4) : "0"}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-gray-500">Earned:</span>
            <span className="text-white font-medium">
              {userStats?.totalEarned
                ? formatEth(userStats.totalEarned, 4)
                : "0"}
            </span>
          </div>
        </div>
      </div>

      {/* Input + Button Row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={customMessage}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Add a message (optional)"
          maxLength={100}
          className="flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-mono text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={isDisabled}
        />
        <Button
          className="px-4 rounded-lg bg-pink-500 text-sm font-bold text-black shadow-lg transition-colors hover:bg-pink-600 disabled:cursor-not-allowed disabled:bg-pink-500/40"
          onClick={onMine}
          disabled={isDisabled}
        >
          <div className="flex flex-col items-center leading-tight">
            <span>{buttonLabel}</span>
            {rigState && buttonLabel === "MINE" && (
              <span className="text-[10px] font-normal opacity-80">
                ${priceUsd.toFixed(2)}
              </span>
            )}
          </div>
        </Button>
      </div>
    </div>
  );
}
