import { SANDBOX_ENDPOINTS, type Provider } from "../src/lib/finance/external-provider-adapters.js";

const providers = Object.entries(SANDBOX_ENDPOINTS) as [Provider, string][];
const results = await Promise.all(providers.map(async ([provider, endpoint]) => {
  try {
    const response = await fetch(endpoint, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    return { provider, endpoint, reachable: true, status: response.status, authenticated: response.status !== 401 && response.status !== 403 };
  } catch (error) {
    return { provider, endpoint, reachable: false, status: null, authenticated: false, error: error instanceof Error ? error.message : String(error) };
  }
}));
console.log(JSON.stringify({ checked_at: new Date().toISOString(), results }, null, 2));
