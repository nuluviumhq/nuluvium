"use client";

// Provides Privy's login state to the app pages. Privy itself (PrivyBridge.tsx) is loaded in the
// browser only, with next/dynamic and no SSR: it never enters the server bundle (size, and its
// dependencies cannot be packed for Workers on every platform). Until it loads, the app sees Privy
// as not ready and shows the logged-out state.

import dynamic from "next/dynamic";
import { useState } from "react";
import { PrivyStateContext, notReady, type PrivyState } from "@/lib/privyState";

const PrivyBridge = dynamic(() => import("./PrivyBridge"), { ssr: false });

export function PrivyAuth({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PrivyState>(notReady);
  return (
    <PrivyStateContext.Provider value={state}>
      <PrivyBridge onState={setState} />
      {children}
    </PrivyStateContext.Provider>
  );
}
