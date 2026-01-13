"use client";

type HeaderProps = {
  title: string;
  action?: React.ReactNode;
};

export function Header({ title, action }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h1 className="text-2xl font-bold tracking-wide">{title}</h1>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}