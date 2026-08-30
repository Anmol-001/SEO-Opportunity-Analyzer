import type { LookupFunction } from "node:net";

import { Agent, buildConnector, fetch as undiciFetch } from "undici";

import type { ValidatedAddress } from "./public-url.ts";

export interface PinnedResponse {
  dispose: () => Promise<void>;
  response: Response;
}

function pinnedLookup({ address, family }: ValidatedAddress): LookupFunction {
  return (_hostname, options, callback) => {
    if (options.all) {
      callback(null, [{ address, family }]);
      return;
    }
    callback(null, address, family);
  };
}

export async function openPinnedResponse(
  target: string | URL,
  init: RequestInit,
  addresses: readonly ValidatedAddress[],
): Promise<PinnedResponse> {
  if (addresses.length === 0) {
    throw new Error("No validated destination address was supplied.");
  }

  let lastError: unknown;
  for (const address of addresses) {
    const dispatcher = new Agent({
      autoSelectFamily: false,
      connect: buildConnector({ lookup: pinnedLookup(address) }),
      connections: 1,
      pipelining: 1,
    });

    try {
      const response = await undiciFetch(target, {
        ...init,
        body: init.body as never,
        dispatcher,
        headers: init.headers as never,
      });
      return {
        dispose: () => dispatcher.destroy(),
        response: response as unknown as Response,
      };
    } catch (error) {
      lastError = error;
      await dispatcher.destroy().catch(() => undefined);
      if (init.signal?.aborted) throw error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("The validated destination could not be reached.");
}
