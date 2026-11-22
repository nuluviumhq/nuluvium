"use client";

// Privy's login state as the app sees it, without importing Privy. The Privy SDK is loaded in the
// browser only (components/app/PrivyBridge.tsx, next/dynamic without SSR), so it never enters the
// server bundle: it is large and its dependencies cannot be packed for Workers on every platform.
// The bridge fills this context; until it has loaded, Privy counts as not ready.

import { createContext, useContext } from "react";
import type { Eip1193Provider } from "./wallet";

export interface BridgeWallet {
  address: string;
  /** "privy" or "privy-v2" for the embedded wallet of an email login; the wallet's name otherwise. */
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
  /** Privy's wallet list only (the login screen has its own email form). */
  loginWithWallet: () => void;
  /** Email login without Privy's modal: send a one-time code, then log in with it. */
  sendEmailCode: (email: string) => Promise<void>;
  loginWithEmailCode: (code: string) => Promise<void>;
  /** Makes the embedded wallet when Privy did not make it at login. */
  createEmbeddedWallet: () => Promise<void>;
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
  loginWithWallet: () => {},
  sendEmailCode: async () => {},
  loginWithEmailCode: async () => {},
  createEmbeddedWallet: async () => {},
  logout: async () => {},
  connectWallet: () => {},
};

export const PrivyStateContext = createContext<PrivyState>(notReady);

export const usePrivyState = () => useContext(PrivyStateContext);

/** Privy's embedded wallet (an email login's): "privy", or "privy-v2" in newer Privy versions. */
export const isEmbedded = (walletClientType: string | null | undefined) => walletClientType === "privy" || walletClientType === "privy-v2";
