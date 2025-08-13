import type { Knex } from "knex";
import { getBankFeedProviders } from "../../bankFeedProviders/bankFeedProviders.model";

export async function getProvider(providerKey: string, trx?: Knex.Transaction) {
  try {
    const res = await getBankFeedProviders({
      providerKeys: [providerKey],
      trx,
    });
    if (!res.success || !res.data?.length) {
      throw new Error(`Provider '${providerKey}' not found`);
    }
    const provider = res.data[0];
    if (provider.status !== "active") {
      throw new Error(`Provider '${providerKey}' is inactive`);
    }

    return provider;
  } catch (error) {
    throw new Error(
      `Failed to fetch provider '${providerKey}': ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}
