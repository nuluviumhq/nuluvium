// Who holds the owner roles, read live from the chain for the Proof page (browser only).
// Router v2 and RelayerRegistry owner (Ownable2Step: the Safe becomes owner once both signers
// accept) and the Privacy Pools Entrypoint OWNER_ROLE (held by the Safe); the deployer that held
// roles first is read too, so anyone can see whether it still has one.

import { keccak256, parseAbi, toHex } from "viem";
import { browserConfig, sdk } from "@/lib/chain";
import { OWNER_SAFE, PREVIOUS_OWNER, RELAYER_REGISTRY } from "@/lib/contracts";

/** The Entrypoint's role id: keccak256("OWNER_ROLE"), as in Privacy Pools' Entrypoint.sol. */
const OWNER_ROLE = keccak256(toHex("OWNER_ROLE"));

const ownableAbi = parseAbi(["function owner() view returns (address)", "function pendingOwner() view returns (address)"]);
const entrypointAbi = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
const safeAbi = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])"]);

export interface OwnerRoles {
  routerOwner: `0x${string}`;
  /** Set while an ownership transfer waits for the new owner to accept (zero address otherwise). */
  routerPendingOwner: `0x${string}`;
  registryOwner: `0x${string}`;
  registryPendingOwner: `0x${string}`;
  safeHasEntrypointOwnerRole: boolean;
  previousOwnerHasEntrypointOwnerRole: boolean;
  safeThreshold: number;
  safeSigners: number;
}

export async function readOwnerRoles(): Promise<OwnerRoles> {
  const { publicClientFor } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const [routerOwner, routerPendingOwner, registryOwner, registryPendingOwner, safeHasEntrypointOwnerRole, previousOwnerHasEntrypointOwnerRole, safeThreshold, safeOwners] =
    await Promise.all([
      client.readContract({ address: config.router, abi: ownableAbi, functionName: "owner" }),
      client.readContract({ address: config.router, abi: ownableAbi, functionName: "pendingOwner" }),
      client.readContract({ address: RELAYER_REGISTRY, abi: ownableAbi, functionName: "owner" }),
      client.readContract({ address: RELAYER_REGISTRY, abi: ownableAbi, functionName: "pendingOwner" }),
      client.readContract({ address: config.entrypoint, abi: entrypointAbi, functionName: "hasRole", args: [OWNER_ROLE, OWNER_SAFE] }),
      client.readContract({ address: config.entrypoint, abi: entrypointAbi, functionName: "hasRole", args: [OWNER_ROLE, PREVIOUS_OWNER] }),
      client.readContract({ address: OWNER_SAFE, abi: safeAbi, functionName: "getThreshold" }),
      client.readContract({ address: OWNER_SAFE, abi: safeAbi, functionName: "getOwners" }),
    ]);
  return {
    routerOwner,
    routerPendingOwner,
    registryOwner,
    registryPendingOwner,
    safeHasEntrypointOwnerRole,
    previousOwnerHasEntrypointOwnerRole,
    safeThreshold: Number(safeThreshold),
    safeSigners: safeOwners.length,
  };
}
