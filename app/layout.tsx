import "@/app/globals.css";
import type { Metadata } from "next";
import { Providers } from "@/components/providers";

const appDomain = "https://miner-launchpad.vercel.app";
const heroImageUrl = `${appDomain}/media/hero.png`;
const splashImageUrl = `${appDomain}/media/splash.png`;

const miniAppEmbed = {
  version: "1",
  imageUrl: heroImageUrl,
  button: {
    title: "Launch & Mine",
    action: {
      type: "launch_miniapp" as const,
      name: "Miner Launchpad",
      url: appDomain,
      splashImageUrl,
      splashBackgroundColor: "#000000",
    },
  },
};

export const metadata: Metadata = {
  title: "Miner Launchpad",
  description: "Launch, mine, and earn tokens on Base. A decentralized token launchpad with fair Dutch auction mining.",
  openGraph: {
    title: "Miner Launchpad",
    description: "Launch your own mining rig, mine on any rig, and participate in treasury auctions.",
    url: appDomain,
    images: [
      {
        url: heroImageUrl,
      },
    ],
  },
  other: {
    "fc:miniapp": JSON.stringify(miniAppEmbed),
    "base:app_id": "6939ca4be6be54f5ed71d538",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
