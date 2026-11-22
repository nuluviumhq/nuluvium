"use client";

// The only module that imports Privy. Loaded in the browser only (PrivyAuth.tsx), it runs Privy's
// provider and login modal and publishes the login state to the app (lib/privyState.ts).
// Login methods: email (Privy makes an embedded wallet for deposits) or an external wallet.
// Privy only authenticates and holds the login wallet; the Nuluvium keys are made in the browser
// (components/app/session.tsx), so Privy never learns the fresh addresses.

import { PrivyProvider, useLoginWithEmail, usePrivy, useWallets } from "@privy-io/react-auth";
import { ROBINHOOD_TESTNET } from "@nuluvium/sdk/config";
import { useEffect, useRef } from "react";
import { defineChain } from "viem";
import { EXPLORER } from "@/lib/contracts";
import type { PrivyState } from "@/lib/privyState";
import type { Eip1193Provider } from "@/lib/wallet";

/** Public Privy app id (not a secret: it only names the app; allowed origins are set in Privy). */
const PRIVY_APP_ID = "cmwj3uikb01710hlb335r8ifo";

// Reads and broadcasts go through this site's /api/rpc (some ISPs block *.robinhood.com).
const robinhoodTestnet = defineChain({
  id: ROBINHOOD_TESTNET.chainId,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [`${window.location.origin}/api/rpc`] } },
  blockExplorers: { default: { name: "Explorer", url: EXPLORER } },
  testnet: true,
});

function Publisher({ onState }: { onState: (state: PrivyState) => void }) {
  const privy = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  // usePrivy returns a new object on every render: keep the latest in a ref for the actions, and
  // publish only when a value the app uses changes (publishing re-renders this component).
  const latest = useRef(privy);
  latest.current = privy;
  // Headless email login: the login screen (LoginScreen.tsx) draws the form, Privy sends and checks the code.
  const email = useLoginWithEmail();
  const latestEmail = useRef(email);
  latestEmail.current = email;
  const userId = privy.user?.id ?? null;
  const loginWalletType = privy.user?.wallet?.walletClientType ?? null;
  const walletKey = wallets.map((wallet) => `${wallet.address}:${wallet.walletClientType}:${wallet.linked}`).join(",");
  const walletsRef = useRef(wallets);
  walletsRef.current = wallets;

  // biome-ignore lint/correctness/useExhaustiveDependencies: walletKey stands for the wallet list (read through walletsRef), so a changed list republishes
  useEffect(() => {
    onState({
      ready: privy.ready,
      authenticated: privy.authenticated,
      userId,
      loginWalletType,
      walletsReady,
      wallets: walletsRef.current.map((wallet) => ({
        address: wallet.address,
        walletClientType: wallet.walletClientType,
        linked: wallet.linked,
        switchChain: (chainId: number) => wallet.switchChain(chainId),
        getEthereumProvider: async () => (await wallet.getEthereumProvider()) as Eip1193Provider,
      })),
      login: () => latest.current.login(),
      loginWithWallet: () => latest.current.login({ loginMethods: ["wallet"] }),
      sendEmailCode: (address: string) => latestEmail.current.sendCode({ email: address }),
      loginWithEmailCode: (code: string) => latestEmail.current.loginWithCode({ code }),
      logout: () => latest.current.logout(),
      connectWallet: () => latest.current.connectWallet(),
    });
  }, [privy.ready, privy.authenticated, userId, loginWalletType, walletsReady, walletKey, onState]);

  return null;
}

export default function PrivyBridge({ onState }: { onState: (state: PrivyState) => void }) {
  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "wallet"],
        appearance: { theme: "light", accentColor: "#0c3628", walletChainType: "ethereum-only", landingHeader: "Log in to Nuluvium" },
        // An email login gets an embedded wallet for deposits; an external wallet login does not.
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" }, showWalletUIs: true },
        defaultChain: robinhoodTestnet,
        supportedChains: [robinhoodTestnet],
      }}
    >
      <Publisher onState={onState} />
    </PrivyProvider>
  );
}
