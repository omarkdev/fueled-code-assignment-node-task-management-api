import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

@Injectable()
export class CacheShutdownService implements OnModuleDestroy {
  constructor(@Inject(CACHE_MANAGER) private readonly cache: unknown) {}

  async onModuleDestroy() {
    const store = (this.cache as { store?: { client?: unknown } })?.store;
    const client = store?.client as
      | { disconnect?: () => Promise<void> | void; quit?: () => Promise<void> | void }
      | undefined;
    if (!client) return;
    try {
      if (typeof client.disconnect === 'function') await client.disconnect();
      else if (typeof client.quit === 'function') await client.quit();
    } catch {
      // best-effort — nothing meaningful to do if shutdown fails
    }
  }
}
