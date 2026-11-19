"use client";

// Privy's login state as the app sees it, without importing Privy. The Privy SDK is loaded in the
// browser only (components/app/PrivyBridge.tsx, next/dynamic without SSR), so it never enters the
// server bundle: it is large and its dependencies cannot be packed for Workers on every platform.
// The bridge fills this context; until it has loaded, Privy counts as not ready.

import { createContext, useContext } from "react";
import type { Eip1193Provider } from "./wallet";

export interface BridgeWallet {
  address: string;
  /** "privy" for the embedded wallet of an email login; the wallet's name otherwise. */
  walletClientType: string;
  linked: boolean;
  switchChain: (chainId: number) => Promise<void>;
  getEthereumProvider: () => Promise<Eip1193Provider>;
}

export interface PrivyState {
  ready: boolean;
  authenticated: boolean;
  userId: string | null;
  /** The wallet Privy recorded at login (embedded or external), when there is one. */
  loginWalletType: string | null;
  walletsReady: boolean;
  wallets: BridgeWallet[];
  login: () => void;
  logout: () => Promise<void>;
  connectWallet: () => void;
}

export const notReady: PrivyState = {
  ready: false,
  authenticated: false,
  userId: null,
  loginWalletType: null,
  walletsReady: false,
  wallets: [],
  login: () => {},
  logout: async () => {},
  connectWallet: () => {},
};

export const PrivyStateContext = createContext<PrivyState>(notReady);

export const usePrivyState = () => useContext(PrivyStateContext);
