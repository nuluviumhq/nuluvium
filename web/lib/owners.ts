// Who holds the owner roles, read live from the chain for the Proof page (browser only).
// Router owner (Ownable2Step) and the Privacy Pools Entrypoint OWNER_ROLE are held by a Safe;
// the deployer that held them first is read too, so anyone can see it no longer has the role.

import { keccak256, parseAbi, toHex } from "viem";
import { browserConfig, sdk } from "@/lib/chain";
import { OWNER_SAFE, PREVIOUS_OWNER } from "@/lib/contracts";

/** The Entrypoint's role id: keccak256("OWNER_ROLE"), as in Privacy Pools' Entrypoint.sol. */
const OWNER_ROLE = keccak256(toHex("OWNER_ROLE"));

const routerAbi = parseAbi(["function owner() view returns (address)"]);
const entrypointAbi = parseAbi(["function hasRole(bytes32 role, address account) view returns (bool)"]);
const safeAbi = parseAbi(["function getThreshold() view returns (uint256)", "function getOwners() view returns (address[])"]);

export interface OwnerRoles {
  routerOwner: `0x${string}`;
  safeHasEntrypointOwnerRole: boolean;
  previousOwnerHasEntrypointOwnerRole: boolean;
  safeThreshold: number;
  safeSigners: number;
}

export async function readOwnerRoles(): Promise<OwnerRoles> {
  const { publicClientFor } = await sdk();
  const config = await browserConfig();
  const client = publicClientFor(config);
  const [routerOwner, safeHasEntrypointOwnerRole, previousOwnerHasEntrypointOwnerRole, safeThreshold, safeOwners] =
    await Promise.all([
      client.readContract({ address: config.router, abi: routerAbi, functionName: "owner" }),
      client.readContract({ address: config.entrypoint, abi: entrypointAbi, functionName: "hasRole", args: [OWNER_ROLE, OWNER_SAFE] }),
      client.readContract({ address: config.entrypoint, abi: entrypointAbi, functionName: "hasRole", args: [OWNER_ROLE, PREVIOUS_OWNER] }),
      client.readContract({ address: OWNER_SAFE, abi: safeAbi, functionName: "getThreshold" }),
      client.readContract({ address: OWNER_SAFE, abi: safeAbi, functionName: "getOwners" }),
    ]);
  return {
    routerOwner,
    safeHasEntrypointOwnerRole,
    previousOwnerHasEntrypointOwnerRole,
    safeThreshold: Number(safeThreshold),
    safeSigners: safeOwners.length,
  };
}
