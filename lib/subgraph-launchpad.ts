import { GraphQLClient, gql } from "graphql-request";

// Subgraph URL - replace with actual URL when deployed
export const LAUNCHPAD_SUBGRAPH_URL =
  process.env.NEXT_PUBLIC_LAUNCHPAD_SUBGRAPH_URL ||
  "https://api.thegraph.com/subgraphs/name/PLACEHOLDER";

const client = new GraphQLClient(LAUNCHPAD_SUBGRAPH_URL);

// Types
export type SubgraphRig = {
  id: string; // rig address
  launcher: string;
  unit: {
    id: string;
    name: string;
    symbol: string;
  };
  auction: {
    id: string;
  };
  lpToken: string;
  createdAt: string;
  totalVolume: string;
  mineCount: string;
};

export type SubgraphMine = {
  id: string;
  miner: string;
  price: string;
  uri: string;
  timestamp: string;
  minedAmount: string;
  txHash: string;
};

export type SubgraphUserRigStats = {
  id: string;
  user: string;
  rig: string;
  totalMined: string;
  totalSpent: string;
  totalEarned: string;
  mineCount: string;
};

export type SubgraphAuction = {
  id: string;
  rig: {
    id: string;
    unit: {
      name: string;
      symbol: string;
    };
  };
  totalBuys: string;
  totalVolume: string;
};

// Queries
export const GET_RIGS_QUERY = gql`
  query GetRigs(
    $first: Int!
    $skip: Int!
    $orderBy: String!
    $orderDirection: String!
  ) {
    rigs(
      first: $first
      skip: $skip
      orderBy: $orderBy
      orderDirection: $orderDirection
    ) {
      id
      launcher
      unit {
        id
        name
        symbol
      }
      auction {
        id
      }
      lpToken
      createdAt
      totalVolume
      mineCount
    }
  }
`;

export const SEARCH_RIGS_QUERY = gql`
  query SearchRigs($search: String!, $first: Int!) {
    rigs(
      first: $first
      where: {
        or: [
          { unit_: { name_contains_nocase: $search } }
          { unit_: { symbol_contains_nocase: $search } }
          { id_contains_nocase: $search }
        ]
      }
      orderBy: totalVolume
      orderDirection: desc
    ) {
      id
      launcher
      unit {
        id
        name
        symbol
      }
      auction {
        id
      }
      lpToken
      createdAt
      totalVolume
      mineCount
    }
  }
`;

export const GET_MINE_HISTORY_QUERY = gql`
  query GetMineHistory($rigId: String!, $first: Int!, $skip: Int!) {
    mines(
      where: { rig: $rigId }
      orderBy: timestamp
      orderDirection: desc
      first: $first
      skip: $skip
    ) {
      id
      miner
      price
      uri
      timestamp
      minedAmount
      txHash
    }
  }
`;

export const GET_USER_RIG_STATS_QUERY = gql`
  query GetUserRigStats($userId: String!, $rigId: String!) {
    userRigStats(id: $userId_$rigId) {
      id
      user
      rig
      totalMined
      totalSpent
      totalEarned
      mineCount
    }
  }
`;

export const GET_USER_ALL_STATS_QUERY = gql`
  query GetUserAllStats($userId: String!, $first: Int!) {
    userRigStats(where: { user: $userId }, first: $first) {
      id
      user
      rig
      totalMined
      totalSpent
      totalEarned
      mineCount
    }
  }
`;

export const GET_ALL_AUCTIONS_QUERY = gql`
  query GetAllAuctions($first: Int!, $skip: Int!) {
    auctions(
      first: $first
      skip: $skip
      orderBy: totalVolume
      orderDirection: desc
    ) {
      id
      rig {
        id
        unit {
          name
          symbol
        }
      }
      totalBuys
      totalVolume
    }
  }
`;

export const GET_TRENDING_RIGS_QUERY = gql`
  query GetTrendingRigs($first: Int!) {
    rigs(
      first: $first
      orderBy: lastMineAt
      orderDirection: desc
    ) {
      id
      launcher
      unit {
        id
        name
        symbol
      }
      auction {
        id
      }
      lpToken
      createdAt
      totalVolume
      mineCount
    }
  }
`;

// API Functions
export async function getRigs(
  first = 20,
  skip = 0,
  orderBy = "totalVolume",
  orderDirection = "desc"
): Promise<SubgraphRig[]> {
  try {
    const data = await client.request<{ rigs: SubgraphRig[] }>(GET_RIGS_QUERY, {
      first,
      skip,
      orderBy,
      orderDirection,
    });
    return data.rigs;
  } catch {
    // Silently fail - on-chain fallback will be used
    return [];
  }
}

export async function searchRigs(
  search: string,
  first = 20
): Promise<SubgraphRig[]> {
  try {
    const data = await client.request<{ rigs: SubgraphRig[] }>(
      SEARCH_RIGS_QUERY,
      {
        search,
        first,
      }
    );
    return data.rigs;
  } catch {
    // Silently fail - on-chain fallback will be used
    return [];
  }
}

export async function getMineHistory(
  rigId: string,
  first = 50,
  skip = 0
): Promise<SubgraphMine[]> {
  try {
    const data = await client.request<{ mines: SubgraphMine[] }>(
      GET_MINE_HISTORY_QUERY,
      {
        rigId: rigId.toLowerCase(),
        first,
        skip,
      }
    );
    return data.mines;
  } catch {
    // Silently fail - subgraph may be unavailable
    return [];
  }
}

export async function getUserRigStats(
  userId: string,
  rigId: string
): Promise<SubgraphUserRigStats | null> {
  try {
    const data = await client.request<{
      userRigStats: SubgraphUserRigStats | null;
    }>(GET_USER_RIG_STATS_QUERY, {
      userId: userId.toLowerCase(),
      rigId: rigId.toLowerCase(),
    });
    return data.userRigStats;
  } catch {
    // Silently fail - subgraph may be unavailable
    return null;
  }
}

export async function getUserAllStats(
  userId: string,
  first = 100
): Promise<SubgraphUserRigStats[]> {
  try {
    const data = await client.request<{ userRigStats: SubgraphUserRigStats[] }>(
      GET_USER_ALL_STATS_QUERY,
      {
        userId: userId.toLowerCase(),
        first,
      }
    );
    return data.userRigStats;
  } catch {
    // Silently fail - subgraph may be unavailable
    return [];
  }
}

export async function getAllAuctions(
  first = 20,
  skip = 0
): Promise<SubgraphAuction[]> {
  try {
    const data = await client.request<{ auctions: SubgraphAuction[] }>(
      GET_ALL_AUCTIONS_QUERY,
      {
        first,
        skip,
      }
    );
    return data.auctions;
  } catch {
    // Silently fail - on-chain fallback will be used
    return [];
  }
}

export async function getTrendingRigs(first = 20): Promise<SubgraphRig[]> {
  try {
    // Get rigs ordered by most recently mined
    const data = await client.request<{ rigs: SubgraphRig[] }>(
      GET_TRENDING_RIGS_QUERY,
      {
        first,
      }
    );
    return data.rigs;
  } catch {
    // Silently fail - on-chain fallback will be used
    return [];
  }
}

// Helper to format subgraph data
export function formatSubgraphAddress(address: string): `0x${string}` {
  return address.toLowerCase() as `0x${string}`;
}
