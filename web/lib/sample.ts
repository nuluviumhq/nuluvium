// Sample data from the prototype (prototype/data.js). Every number, address and hash here is
// invented for design review; nothing is read from a chain. Sessions 1.8b/c replace it with
// chain data. Order sizes stay small: real stock token trades had a median of about $160.

export type OrderStatus = "scheduled" | "routing" | "done" | "cancelled";
export type Side = "buy" | "sell";

export interface SampleOrder {
  id: string;
  placed: string;
  token: string;
  side: Side;
  amount: number;
  pieces: number;
  done: number;
  window: string;
  status: OrderStatus;
}

export const SAMPLE = {
  shieldedBalance: 12400, // USDG in the sample wallet's shielded balance
  tokens: [
    { symbol: "NVDA", name: "NVIDIA", price: 219.84, volume: "$41,200" },
    { symbol: "TSLA", name: "Tesla", price: 348.1, volume: "$28,600" },
    { symbol: "META", name: "Meta Platforms", price: 731.55, volume: "$19,800" },
    { symbol: "GOOGL", name: "Alphabet", price: 204.37, volume: "$12,100" },
    { symbol: "AMZN", name: "Amazon", price: 241.02, volume: "$9,600" },
  ],
  // The signed-in sample wallet's orders. New orders from the ticket are added in localStorage.
  orders: [
    { id: "R-0412", placed: "14 Nov, 15:02", token: "TSLA", side: "sell", amount: 2200, pieces: 3, done: 1, window: "2 h", status: "routing" },
    { id: "R-0409", placed: "14 Nov, 09:31", token: "NVDA", side: "buy", amount: 8000, pieces: 5, done: 5, window: "6 h", status: "done" },
    { id: "R-0398", placed: "12 Nov, 18:47", token: "META", side: "buy", amount: 3650, pieces: 3, done: 3, window: "Until the open", status: "done" },
    { id: "R-0391", placed: "11 Nov, 13:05", token: "AMZN", side: "sell", amount: 1200, pieces: 2, done: 0, window: "30 min", status: "cancelled" },
  ] satisfies SampleOrder[],
  // Single pieces as anyone sees them on chain: an ordinary swap from an address nobody can link.
  pieces: [
    { token: "NVDA", size: 1600, price: 219.61, from: "0x3a7e…91d2", when: "14 Nov, 14:58" },
    { token: "TSLA", size: 740, price: 347.9, from: "0xc04b…5e1a", when: "14 Nov, 15:21" },
    { token: "NVDA", size: 1600, price: 219.7, from: "0x81f0…0c47", when: "14 Nov, 13:12" },
    { token: "META", size: 1220, price: 730.9, from: "0x5d92…b3e8", when: "12 Nov, 21:40" },
  ],
  agentKeys: [
    { name: "desk-agent-1", created: "09 Nov 2026", limit: "$25,000 a day", status: "active" },
    { name: "weekend-batch", created: "02 Nov 2026", limit: "$5,000 a day", status: "paused" },
  ],
  agentActivity: [
    { when: "14 Nov, 15:02", agent: "desk-agent-1", action: "route_order", detail: "Sell 2,200 USDG of TSLA in 3 pieces over 2 h" },
    { when: "14 Nov, 09:31", agent: "desk-agent-1", action: "route_order", detail: "Buy 8,000 USDG of NVDA in 5 pieces over 6 h" },
    { when: "13 Nov, 21:15", agent: "weekend-batch", action: "get_fills", detail: "Read 3 pieces" },
  ],
  contracts: [
    { name: "Shielded pool (Privacy Pools v1 fork)", address: "Not deployed", note: "Holds shielded USDG, checks clean-funds proofs" },
    { name: "Router", address: "Not deployed", note: "Sends each piece to the public pools" },
    { name: "Fee and burn", address: "Not deployed", note: "Collects the 0.10% fee, buys and burns" },
  ],
  burns: [
    { when: "14 Nov 2026", amount: "41,200", tx: "0x77aa…19c0" },
    { when: "07 Nov 2026", amount: "38,650", tx: "0x0f3e…a2d4" },
    { when: "31 Oct 2026", amount: "29,900", tx: "0xc81b…6e07" },
  ],
} as const;
