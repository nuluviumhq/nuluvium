"use client";

// App state: the unlocked wallet, the shielded balance, orders, and the unlock modal and toast
// (ported from prototype/shell.js). Login goes through Privy (PrivyAuth.tsx), then the Nuluvium keys
// are made in this browser:
//   - external wallet: one signature of a fixed message (lib/wallet.ts), asked again after a reload;
//   - email (Privy embedded wallet): a recovery phrase made here and kept encrypted on this device
//     (lib/deviceKeys.ts), never a signature Privy could reproduce. Unlocks by itself after a reload.
// Keys live in memory only. Orders are kept encrypted in this browser and sent by OrderEngine
// while the tab is open.

import type { UserKeys } from "@nuluvium/sdk";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { readShieldedBalance, sdk, type ShieldedBalance } from "@/lib/chain";
import { loadDeviceSecret, saveDeviceSecret } from "@/lib/deviceKeys";
import { usePrivyState, type BridgeWallet } from "@/lib/privyState";
import { LoginScreen, type PhraseStep } from "./LoginScreen";
import { OrderEngine } from "@/lib/engine";
import { isOpen, type Order } from "@/lib/orders";
import { SLIPPAGE_BPS, TOKENS } from "@/lib/tokens";
import { WalletError, depositToPool, explorerTx, setActiveProvider, shortAddress, unlockWithWallet, type Eip1193Provider, type WalletStep } from "@/lib/wallet";

/** Beta caps enforced by the approved-set provider (asp/src/screen.js). */
export const DEPOSIT_CAP = 1_000n * 1_000_000n;
export const MIN_PIECE = 1_000_000n; // 1 tUSDG
export const START_DELAY_SECONDS = 30;

interface Session {
  address: `0x${string}`;
  /** Short form for the sidebar and phone bar. */
  wallet: string;
  keys: UserKeys;
  /** How the keys were made: a wallet signature, or a recovery phrase on this device (email login). */
  kind: "wallet" | "email";
}

/** The wallet that unlocks: a linked external wallet first, else the Privy embedded one. */
function pickWallet(wallets: BridgeWallet[]): BridgeWallet | undefined {
  return wallets.find((wallet) => wallet.walletClientType !== "privy" && wallet.linked) ?? wallets.find((wallet) => wallet.walletClientType === "privy");
}

export interface BalanceState {
  state: "idle" | "reading" | "ready" | "failed";
  value?: ShieldedBalance;
}

export interface NewOrder {
  token: string;
  amount: bigint;
  pieces: number;
  windowSeconds: number;
  windowLabel: string;
}

interface SessionContext {
  session: Session | null;
  /** Runs the action now when unlocked; otherwise asks to log in first, then runs it. */
  requireLogin: (action: () => void) => void;
  openLogin: (next?: () => void) => void;
  logout: () => void;
  /** Shows a short message; with tx, a "View on explorer" link (the message then stays longer). */
  toast: (message: string, tx?: string) => void;
  balance: BalanceState;
  refreshBalance: () => void;
  orders: Order[];
  /** Plans and schedules an order; returns it, or throws with a message for the person. */
  placeOrder: (order: NewOrder) => Promise<Order>;
  cancelOrder: (id: string) => Promise<number>;
  /**
   * Runs `work` with the order engine stopped (so it cannot write the schedule meanwhile), then
   * starts it again, reading the schedule fresh. Used by Account for restore and clear.
   */
  withOrdersPaused: <T>(work: () => Promise<T>) => Promise<T>;
  deposit: (amount: bigint, onStep?: (step: WalletStep) => void) => Promise<string>;
}

const Context = createContext<SessionContext | null>(null);

export function useSession(): SessionContext {
  const context = useContext(Context);
  if (!context) throw new Error("useSession must be used inside SessionProvider");
  return context;
}

/** A message for the person from a wallet or chain error (never a raw stack or URL). */
export function friendlyError(error: unknown): string {
  if (error instanceof WalletError) return error.message;
  const code = (error as { code?: number }).code;
  if (code === 4001) return "You declined in your wallet. Nothing was sent.";
  const short = (error as { shortMessage?: string }).shortMessage;
  if (short && /insufficient funds/i.test(short)) {
    return "Your wallet has no testnet ETH for gas. Use Get test funds on Overview (once a day), or the official faucet: faucet.testnet.chain.robinhood.com.";
  }
  return short ?? (error instanceof Error ? error.message : "Something went wrong. Please try again.");
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  // Bumped to restart the order engine after its stored schedule changed underneath it.
  const [ordersEpoch, setOrdersEpoch] = useState(0);
  const [balance, setBalance] = useState<BalanceState>({ state: "idle" });
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastTx, setToastTx] = useState<string | null>(null);
  // The login screen covers the app while nobody is unlocked, until "Look around first".
  const [screen, setScreen] = useState(true);
  const [step, setStep] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phrase, setPhrase] = useState<PhraseStep | null>(null);
  const privy = usePrivyState();
  const { wallets, walletsReady } = privy;
  // Set when the person asked to log in (or an email login can unlock by itself after a reload).
  const [unlockWanted, setUnlockWanted] = useState(false);
  const unlocking = useRef(false);
  const autoTried = useRef(false);
  const afterLogin = useRef<(() => void) | null>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const engine = useRef<OrderEngine | null>(null);
  const balanceRun = useRef(0);

  const toast = useCallback((message: string, tx?: string) => {
    setToastMessage(message);
    setToastTx(tx ?? null);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMessage(null), tx ? 9000 : 4200);
  }, []);

  const refreshBalance = useCallback(() => {
    if (!session) return;
    const run = ++balanceRun.current;
    setBalance((current) => ({ state: current.value ? "ready" : "reading", value: current.value }));
    readShieldedBalance(session.keys).then(
      (value) => run === balanceRun.current && setBalance({ state: "ready", value }),
      () => run === balanceRun.current && setBalance((current) => ({ state: current.value ? "ready" : "failed", value: current.value })),
    );
  }, [session]);

  // Unlocked: read the balance and start the order engine (resumes pieces still scheduled).
  // biome-ignore lint/correctness/useExhaustiveDependencies: ordersEpoch is a restart signal (after a restore), not read inside
  useEffect(() => {
    if (!session) {
      setBalance({ state: "idle" });
      setOrders([]);
      return;
    }
    refreshBalance();
    const current = new OrderEngine(session.address, session.keys, setOrders, refreshBalance);
    engine.current = current;
    void current.start();
    return () => {
      current.stop();
      engine.current = null;
    };
    // ordersEpoch: a restart after a restore reads the new schedule.
  }, [session, refreshBalance, ordersEpoch]);

  // While a deposit waits for approval, look again every 20 s (the ASP posts within about a minute).
  useEffect(() => {
    if (!balance.value?.notes.some((note) => note.approval === "waiting")) return;
    const timer = window.setTimeout(refreshBalance, 20_000);
    return () => window.clearTimeout(timer);
  }, [balance, refreshBalance]);

  // Leaving with pieces still to send: the browser asks first (they only go out while open).
  useEffect(() => {
    const waiting = orders.some((order) => order.pieces.some((piece) => piece.status === "scheduled" || piece.status === "sending"));
    if (!waiting) return;
    const onLeave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [orders]);

  /** Shows the login screen (LoginScreen.tsx) over the app. */
  const showScreen = useCallback(() => {
    if (document.activeElement instanceof HTMLElement && !document.activeElement.closest(".login-screen")) lastFocus.current = document.activeElement;
    setScreen(true);
  }, []);

  // Logged in with Privy already (a wallet login after a reload): unlocking starts at once.
  const openLogin = useCallback(
    (next?: () => void) => {
      afterLogin.current = next ?? null;
      setStep(null);
      setLoginError(null);
      setPhrase(null);
      setUnlockWanted(Boolean(privy.authenticated));
      showScreen();
    },
    [privy.authenticated, showScreen],
  );

  /** "Look around first": hides the screen; a later Log in brings it back. */
  const closeLogin = useCallback(() => {
    afterLogin.current = null;
    setUnlockWanted(false);
    setScreen(false);
    lastFocus.current?.focus?.();
  }, []);

  const finish = useCallback(
    (address: `0x${string}`, keys: UserKeys, kind: Session["kind"]) => {
      setSession({ address, wallet: shortAddress(address), keys, kind });
      const next = afterLogin.current;
      closeLogin();
      setPhrase(null);
      setStep(null);
      toast(`Unlocked with ${shortAddress(address)}.`);
      next?.();
    },
    [closeLogin, toast],
  );

  /** After Privy login: the provider, then keys from a wallet signature or from this device. */
  const unlock = useCallback(
    async (wallet: BridgeWallet) => {
      setBusy(true);
      setLoginError(null);
      try {
        await wallet.switchChain(46_630).catch(() => {});
        const provider = (await wallet.getEthereumProvider()) as Eip1193Provider;
        setActiveProvider(provider);
        const address = wallet.address as `0x${string}`;
        if (wallet.walletClientType === "privy") {
          const userId = privy.userId;
          if (!userId) throw new WalletError("Privy did not return your account. Please log in again.");
          const saved = await loadDeviceSecret(userId);
          if (saved) {
            const { keysFromMnemonic } = await sdk();
            finish(address, keysFromMnemonic(saved), "email");
          } else {
            setPhrase({ mode: "choose" });
          }
        } else {
          finish(address, await unlockWithWallet(provider, address, setStep), "wallet");
        }
      } catch (error) {
        const code = (error as { code?: number }).code;
        setLoginError(
          error instanceof WalletError ? error.message : code === 4001 ? "You declined in your wallet. Nothing was signed." : "The wallet could not finish. Please try again.",
        );
        setStep(null);
      } finally {
        setBusy(false);
      }
    },
    [finish, privy.userId],
  );

  // Logged in with Privy and asked to unlock: open the modal and make the keys. Waits until Privy
  // has the wallet (an email login's embedded wallet is created right after login).
  useEffect(() => {
    if (!unlockWanted || !privy.ready || !privy.authenticated || !walletsReady || session || unlocking.current) return;
    const wallet = pickWallet(wallets);
    if (!wallet) {
      if (privy.loginWalletType && privy.loginWalletType !== "privy") {
        showScreen();
        setLoginError("Connect your wallet to unlock.");
      }
      return;
    }
    showScreen();
    unlocking.current = true;
    void unlock(wallet).finally(() => {
      unlocking.current = false;
    });
  }, [unlockWanted, privy.ready, privy.authenticated, privy.loginWalletType, walletsReady, wallets, session, showScreen, unlock]);

  // After a reload, an email login with keys on this device unlocks by itself (no prompt needed).
  useEffect(() => {
    if (autoTried.current || !privy.ready || !privy.authenticated || !walletsReady || session) return;
    const wallet = pickWallet(wallets);
    const userId = privy.userId;
    if (!wallet || wallet.walletClientType !== "privy" || !userId) return;
    autoTried.current = true;
    loadDeviceSecret(userId).then(
      (saved) => saved && setUnlockWanted(true),
      () => {},
    );
  }, [privy.ready, privy.authenticated, privy.userId, walletsReady, wallets, session]);

  /** Email login, first time on this device: a new recovery phrase, stored once it is written down. */
  const startNewPhrase = async () => {
    const { newMnemonic } = await sdk();
    setPhrase({ mode: "new", phrase: newMnemonic(), saved: false });
  };

  const applyPhrase = async (text: string) => {
    const wallet = pickWallet(wallets);
    const userId = privy.userId;
    if (!wallet || !userId) return setLoginError("Log in again, then try once more.");
    const { isValidMnemonic, keysFromMnemonic } = await sdk();
    const clean = text.trim().toLowerCase().split(/\s+/).join(" ");
    if (!isValidMnemonic(clean)) return setLoginError("That is not a valid recovery phrase. Check the words and their order.");
    setBusy(true);
    try {
      await saveDeviceSecret(userId, clean);
      finish(wallet.address as `0x${string}`, keysFromMnemonic(clean), "email");
    } catch {
      setLoginError("This browser could not store your keys (private mode or storage blocked).");
    } finally {
      setBusy(false);
    }
  };

  const placeOrder = async ({ token, amount, pieces, windowSeconds, windowLabel }: NewOrder): Promise<Order> => {
    const current = engine.current;
    if (!session || !current) throw new Error("Log in first.");
    if (!TOKENS.some((item) => item.symbol === token)) throw new Error(`${token} is not tradable on testnet.`);
    if (amount < MIN_PIECE * BigInt(pieces)) throw new Error("Each piece must be at least 1 tUSDG. Lower the pieces or raise the amount.");

    // One order is paid from one approved note: the smallest free one that covers it.
    const busyNotes = new Set(orders.filter(isOpen).map((order) => order.depositIndex));
    const approvedIndexes = new Set((balance.value?.notes ?? []).filter((note) => note.approval === "approved").map((note) => note.depositIndex.toString()));
    const notes = (await current.notes()).filter(
      (note) => note.value >= amount && approvedIndexes.has(note.depositIndex.toString()) && !busyNotes.has(note.depositIndex.toString()),
    );
    const note = notes.sort((a, b) => (a.value < b.value ? -1 : 1))[0];
    if (!note) throw new Error("No approved deposit of yours covers this amount on its own. Deposit more, or wait for a deposit to be approved.");

    const { planPieces } = await sdk();
    const start = Math.floor(Date.now() / 1000) + START_DELAY_SECONDS;
    const minGapSeconds = Math.min(30, Math.floor(windowSeconds / Math.max(1, pieces - 1)));
    const plan = planPieces({ amount, pieces, windowSeconds, start, minPiece: MIN_PIECE, minGapSeconds });
    const order: Order = {
      id: `R-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      token,
      side: "buy",
      amount: amount.toString(),
      window: windowLabel,
      depositIndex: note.depositIndex.toString(),
      slippageBps: SLIPPAGE_BPS,
      createdAt: Math.floor(Date.now() / 1000),
      pieces: plan.map((piece) => ({ number: piece.number, amount: piece.amount.toString(), at: piece.at, status: "scheduled" })),
    };
    await current.add(order);
    return order;
  };

  const value: SessionContext = {
    session,
    openLogin,
    requireLogin: (action) => (session ? action() : openLogin(action)),
    logout: () => {
      setSession(null);
      setActiveProvider(null);
      autoTried.current = true; // do not unlock again by itself after logging out
      setUnlockWanted(false);
      setScreen(true);
      void privy.logout();
      toast("Logged out. Your keys were cleared from memory; scheduled pieces wait until you log in again.");
    },
    toast,
    balance,
    refreshBalance,
    orders,
    placeOrder,
    cancelOrder: async (id) => (engine.current ? engine.current.cancel(id) : 0),
    withOrdersPaused: async (work) => {
      engine.current?.stop();
      // Let a save already under way finish before the schedule is touched.
      await engine.current?.idle();
      try {
        return await work();
      } finally {
        setOrdersEpoch((epoch) => epoch + 1);
      }
    },
    deposit: async (amount, onStep) => {
      if (!session) throw new Error("Log in first.");
      if (amount > DEPOSIT_CAP) throw new Error("Deposits are capped at 1,000 tUSDG until the audit.");
      const tx = await depositToPool(session.address, session.keys, amount, onStep);
      refreshBalance();
      return tx;
    },
  };

  return (
    <Context.Provider value={value}>
      {children}
      {!session && screen ? (
        <LoginScreen
          privy={privy}
          phrase={phrase}
          setPhrase={setPhrase}
          unlocking={unlockWanted}
          busy={busy}
          step={step}
          error={loginError}
          setError={setLoginError}
          onBegin={() => {
            setLoginError(null);
            setUnlockWanted(true);
          }}
          onNewPhrase={() => void startNewPhrase()}
          onApplyPhrase={(text) => void applyPhrase(text)}
          onBrowse={closeLogin}
        />
      ) : null}
      <div className={toastMessage ? "toast show" : "toast"} role="status" aria-live="polite">
        {toastMessage}
        {toastMessage && toastTx ? (
          <>
            {" "}
            <a href={explorerTx(toastTx)} target="_blank" rel="noreferrer">View on explorer</a>
          </>
        ) : null}
      </div>
    </Context.Provider>
  );
}
