import type { ProviderId } from '../execution/execution-profile.js';
import { executionError } from '../execution/errors.js';
import type { ProviderAdapter } from './provider-adapter.js';

export class ProviderAdapterRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();
  registerProviderAdapter(adapter: ProviderAdapter): void {
    if (this.adapters.has(adapter.provider_id)) throw executionError('UNKNOWN_PROVIDER');
    this.adapters.set(adapter.provider_id, adapter);
  }
  getProviderAdapter(id: ProviderId): ProviderAdapter | undefined { return this.adapters.get(id); }
  listProviderAdapters(): readonly ProviderAdapter[] { return [...this.adapters.values()]; }
  assertProviderAdapterSupported(id: ProviderId): ProviderAdapter {
    const adapter = this.getProviderAdapter(id);
    if (!adapter) throw executionError('UNKNOWN_PROVIDER');
    return adapter;
  }
}
