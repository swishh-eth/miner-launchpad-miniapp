"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFarcaster, getUserDisplayName, initialsFrom } from "@/hooks/useFarcaster";

type HeaderProps = {
  title: string;
  action?: React.ReactNode;
};

function ProfileButton() {
  const { user, isConnected } = useFarcaster();

  const displayName = getUserDisplayName(user);
  const avatarUrl = user?.pfpUrl ?? null;

  return (
    <Link href="/profile">
      {isConnected && user ? (
        <Avatar className="h-8 w-8 border border-zinc-700">
          <AvatarImage
            src={avatarUrl || undefined}
            alt={displayName}
            className="object-cover"
          />
          <AvatarFallback className="bg-zinc-800 text-white text-xs">
            {initialsFrom(displayName)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center">
          <span className="text-zinc-500 text-xs">?</span>
        </div>
      )}
    </Link>
  );
}

export function Header({ title, action }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-2xl font-bold tracking-wide">{title}</h1>
      <div className="flex items-center gap-2">
        {action}
        <ProfileButton />
      </div>
    </div>
  );
}