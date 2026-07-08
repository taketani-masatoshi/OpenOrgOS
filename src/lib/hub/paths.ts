import { join } from "node:path";
import { getHubRuntime } from "./runtime.js";

export function getHubDataDir(): string {
  return getHubRuntime().dataDir;
}

export function getHubId(): string {
  return getHubRuntime().hubId;
}

export function getHubSigningKeyPath(): string {
  return join(getHubDataDir(), "signing-key.pem");
}

export function getHubAttestationsPath(): string {
  return join(getHubDataDir(), "witness-attestations.jsonl");
}

export function getHubReceiptsPath(): string {
  return join(getHubDataDir(), "witness-receipts.jsonl");
}

export function getHubRegisteredOrgsPath(): string {
  return join(getHubDataDir(), "registered-orgs.yaml");
}

export function getHubFederationPath(): string {
  return join(getHubDataDir(), "hub-federation.yaml");
}

export function getGossipCursorDir(): string {
  return join(getHubDataDir(), "gossip-cursor");
}

export function getGossipCursorPath(peerId: string): string {
  return join(getGossipCursorDir(), `${peerId}.json`);
}
