/**
 * PolicyWatcher - Runtime policy source monitoring
 *
 * Watches file, URL, or custom policy providers and emits loaded policy
 * events. TealEngine owns validation and atomic policy swaps.
 */

import { watch } from 'fs';
import type { FSWatcher } from 'fs';
import { readFile } from 'fs/promises';
import type { TealPolicy } from './types';

export const PolicyWatcherEventType = {
  POLICY_SOURCE_CHANGED: 'POLICY_SOURCE_CHANGED',
  POLICY_SOURCE_UNCHANGED: 'POLICY_SOURCE_UNCHANGED',
  POLICY_SOURCE_ERROR: 'POLICY_SOURCE_ERROR',
} as const;

export type PolicyWatcherEventTypeValue =
  typeof PolicyWatcherEventType[keyof typeof PolicyWatcherEventType];

export interface PolicySourceState {
  etag?: string;
  lastModified?: string;
  version?: string;
}

export interface PolicyProviderLoadResult {
  policy?: TealPolicy;
  unchanged?: boolean;
  etag?: string;
  lastModified?: string;
  version?: string;
}

export interface PolicyProvider {
  name?: string;
  loadPolicy(state: Readonly<PolicySourceState>): Promise<TealPolicy | PolicyProviderLoadResult | null>;
}

export interface FilePolicySource {
  type: 'file';
  path: string;
  parse?: (content: string) => TealPolicy;
}

export interface UrlPolicySource {
  type: 'url';
  url: string;
  headers?: Record<string, string>;
  parse?: (content: string) => TealPolicy;
}

export interface ProviderPolicySource {
  type: 'provider';
  provider: PolicyProvider;
}

export type PolicySource = FilePolicySource | UrlPolicySource | ProviderPolicySource;

export interface PolicySourceDescriptor {
  type: PolicySource['type'];
  path?: string;
  url?: string;
  provider?: string;
  etag?: string;
  lastModified?: string;
  version?: string;
}

export interface PolicyWatcherOptions {
  debounceMs?: number;
  intervalMs?: number;
  loadOnStart?: boolean;
}

export interface PolicyWatcherLoadResult {
  changed: boolean;
  source: PolicySourceDescriptor;
  policy?: TealPolicy;
}

export interface PolicySourceChangedEvent {
  type: typeof PolicyWatcherEventType.POLICY_SOURCE_CHANGED;
  timestamp: number;
  source: PolicySourceDescriptor;
  policy: TealPolicy;
}

export interface PolicySourceUnchangedEvent {
  type: typeof PolicyWatcherEventType.POLICY_SOURCE_UNCHANGED;
  timestamp: number;
  source: PolicySourceDescriptor;
}

export interface PolicySourceErrorEvent {
  type: typeof PolicyWatcherEventType.POLICY_SOURCE_ERROR;
  timestamp: number;
  source: PolicySourceDescriptor;
  error: string;
}

export type PolicyWatcherEvent =
  | PolicySourceChangedEvent
  | PolicySourceUnchangedEvent
  | PolicySourceErrorEvent;

export type PolicyWatcherListener = (event: PolicyWatcherEvent) => void | Promise<void>;

export class PolicyWatcher {
  private readonly source: PolicySource;
  private readonly debounceMs: number;
  private readonly intervalMs: number;
  private readonly loadOnStart: boolean;
  private readonly listeners = new Set<PolicyWatcherListener>();
  private state: PolicySourceState = {};
  private fileWatcher: FSWatcher | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private running = false;

  constructor(source: PolicySource, options: PolicyWatcherOptions = {}) {
    this.source = source;
    this.debounceMs = options.debounceMs ?? 100;
    this.intervalMs = options.intervalMs ?? 30_000;
    this.loadOnStart = options.loadOnStart === true;
  }

  onEvent(listener: PolicyWatcherListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    this.running = true;

    if (this.loadOnStart) {
      await this.load();
    }

    if (this.source.type === 'file') {
      this.fileWatcher = watch(this.source.path, () => {
        this.scheduleLoad();
      });
      return;
    }

    this.pollTimer = setInterval(() => {
      void this.load();
    }, this.intervalMs);
  }

  stop(): void {
    this.running = false;

    if (this.fileWatcher) {
      this.fileWatcher.close();
      this.fileWatcher = undefined;
    }

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }
  }

  async load(): Promise<PolicyWatcherLoadResult> {
    try {
      const result = await this.loadFromSource();

      if (!result.changed) {
        this.emit({
          type: PolicyWatcherEventType.POLICY_SOURCE_UNCHANGED,
          timestamp: Date.now(),
          source: result.source,
        });
        return result;
      }

      const policy = result.policy;
      if (!policy) {
        throw new Error('Policy source reported a change without a policy payload');
      }

      this.emit({
        type: PolicyWatcherEventType.POLICY_SOURCE_CHANGED,
        timestamp: Date.now(),
        source: result.source,
        policy,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emit({
        type: PolicyWatcherEventType.POLICY_SOURCE_ERROR,
        timestamp: Date.now(),
        source: this.describeSource(),
        error: message,
      });
      throw error;
    }
  }

  getSource(): PolicySource {
    return this.source;
  }

  getSourceDescriptor(): PolicySourceDescriptor {
    return this.describeSource();
  }

  getSourceState(): Readonly<PolicySourceState> {
    return Object.freeze({ ...this.state });
  }

  private scheduleLoad(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      void this.load();
    }, this.debounceMs);
  }

  private async loadFromSource(): Promise<PolicyWatcherLoadResult> {
    if (this.source.type === 'file') {
      return this.loadFromFile(this.source);
    }

    if (this.source.type === 'url') {
      return this.loadFromUrl(this.source);
    }

    return this.loadFromProvider(this.source);
  }

  private async loadFromFile(source: FilePolicySource): Promise<PolicyWatcherLoadResult> {
    const content = await readFile(source.path, 'utf8');
    const policy = this.parsePolicy(content, source.parse);
    return {
      changed: true,
      source: this.describeSource(),
      policy,
    };
  }

  private async loadFromUrl(source: UrlPolicySource): Promise<PolicyWatcherLoadResult> {
    const headers: Record<string, string> = { ...(source.headers ?? {}) };

    if (this.state.etag) {
      headers['If-None-Match'] = this.state.etag;
    }

    if (this.state.lastModified) {
      headers['If-Modified-Since'] = this.state.lastModified;
    }

    const response = await fetch(source.url, { headers });
    if (response.status === 304) {
      return {
        changed: false,
        source: this.describeSource(),
      };
    }

    if (!response.ok) {
      throw new Error(`Policy HTTP source failed with status ${response.status}`);
    }

    const etag = response.headers.get('etag');
    const lastModified = response.headers.get('last-modified');
    this.state = {
      ...(etag && { etag }),
      ...(lastModified && { lastModified }),
    };

    const content = await response.text();
    const policy = this.parsePolicy(content, source.parse);
    return {
      changed: true,
      source: this.describeSource(),
      policy,
    };
  }

  private async loadFromProvider(source: ProviderPolicySource): Promise<PolicyWatcherLoadResult> {
    const loaded = await source.provider.loadPolicy(this.getSourceState());

    if (!loaded) {
      return {
        changed: false,
        source: this.describeSource(),
      };
    }

    const result = this.normalizeProviderResult(loaded);
    if (result.unchanged || !result.policy) {
      this.state = {
        ...this.state,
        ...(result.etag && { etag: result.etag }),
        ...(result.lastModified && { lastModified: result.lastModified }),
        ...(result.version && { version: result.version }),
      };

      return {
        changed: false,
        source: this.describeSource(),
      };
    }

    this.state = {
      ...this.state,
      ...(result.etag && { etag: result.etag }),
      ...(result.lastModified && { lastModified: result.lastModified }),
      ...(result.version && { version: result.version }),
    };

    return {
      changed: true,
      source: this.describeSource(),
      policy: result.policy,
    };
  }

  private normalizeProviderResult(
    loaded: TealPolicy | PolicyProviderLoadResult
  ): PolicyProviderLoadResult {
    if ('policy' in loaded || 'unchanged' in loaded || 'etag' in loaded || 'lastModified' in loaded || 'version' in loaded) {
      return loaded as PolicyProviderLoadResult;
    }

    return { policy: loaded as TealPolicy };
  }

  private parsePolicy(content: string, parser?: (content: string) => TealPolicy): TealPolicy {
    if (parser) {
      return parser(content);
    }

    return JSON.parse(content) as TealPolicy;
  }

  private describeSource(): PolicySourceDescriptor {
    if (this.source.type === 'file') {
      return {
        type: 'file',
        path: this.source.path,
        ...this.state,
      };
    }

    if (this.source.type === 'url') {
      return {
        type: 'url',
        url: this.source.url,
        ...this.state,
      };
    }

    return {
      type: 'provider',
      provider: this.source.provider.name ?? 'custom',
      ...this.state,
    };
  }

  private emit(event: PolicyWatcherEvent): void {
    for (const listener of this.listeners) {
      void listener(event);
    }
  }
}
