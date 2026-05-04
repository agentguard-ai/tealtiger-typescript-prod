/**
 * LazyLoader - Dynamic Provider Loading System
 * 
 * Implements lazy loading for provider clients to reduce cold start time
 * and package size in serverless environments.
 * 
 * Requirements: 1.2, 1.3
 */

export type ProviderName = 
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'bedrock'
  | 'azure-openai'
  | 'cohere'
  | 'mistral';

export interface LazyLoaderConfig {
  /**
   * Enable lazy loading (default: true in serverless environments)
   */
  enabled?: boolean;
  
  /**
   * Preload specific providers on initialization
   */
  preload?: ProviderName[];
  
  /**
   * Cache loaded providers (default: true)
   */
  cache?: boolean;
}

export interface ProviderModule {
  [key: string]: any;
}

/**
 * LazyLoader manages dynamic imports of provider clients
 */
export class LazyLoader {
  private static instance: LazyLoader;
  private loadedProviders: Map<ProviderName, ProviderModule> = new Map();
  private loadingPromises: Map<ProviderName, Promise<ProviderModule>> = new Map();
  private config: Required<LazyLoaderConfig>;

  private constructor(config: LazyLoaderConfig = {}) {
    this.config = {
      enabled: config.enabled ?? this.isServerlessEnvironment(),
      preload: config.preload ?? [],
      cache: config.cache ?? true
    };

    // Preload specified providers
    if (this.config.preload.length > 0) {
      this.preloadProviders(this.config.preload);
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(config?: LazyLoaderConfig): LazyLoader {
    if (!LazyLoader.instance) {
      LazyLoader.instance = new LazyLoader(config);
    }
    return LazyLoader.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    if (LazyLoader.instance) {
      LazyLoader.instance.loadedProviders.clear();
      LazyLoader.instance.loadingPromises.clear();
    }
    LazyLoader.instance = null as any;
  }

  /**
   * Detect if running in serverless environment
   */
  private isServerlessEnvironment(): boolean {
    return !!(
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.AZURE_FUNCTIONS_ENVIRONMENT ||
      process.env.FUNCTION_NAME || // GCP Cloud Functions
      process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.CLOUDFLARE_WORKERS ||
      process.env.DENO_DEPLOYMENT_ID
    );
  }

  /**
   * Load a provider client dynamically
   */
  public async loadProvider<T = any>(provider: ProviderName): Promise<T> {
    // If lazy loading is disabled, use synchronous import
    if (!this.config.enabled) {
      return this.loadProviderSync<T>(provider);
    }

    // Return cached provider if available
    if (this.config.cache && this.loadedProviders.has(provider)) {
      const module = this.loadedProviders.get(provider)!;
      return module as T;
    }

    // Return existing loading promise if in progress
    if (this.loadingPromises.has(provider)) {
      const module = await this.loadingPromises.get(provider)!;
      return module as T;
    }

    // Start loading the provider
    const loadingPromise = this.importProvider(provider);
    this.loadingPromises.set(provider, loadingPromise);

    try {
      const module = await loadingPromise;
      
      // Cache the loaded module
      if (this.config.cache) {
        this.loadedProviders.set(provider, module);
      }
      
      // Clean up loading promise
      this.loadingPromises.delete(provider);
      
      return module as T;
    } catch (error) {
      // Clean up on error
      this.loadingPromises.delete(provider);
      throw new Error(`Failed to load provider '${provider}': ${error}`);
    }
  }

  /**
   * Load provider synchronously (when lazy loading is disabled)
   */
  private loadProviderSync<T = any>(provider: ProviderName): T {
    // Check cache first
    if (this.loadedProviders.has(provider)) {
      const module = this.loadedProviders.get(provider)!;
      return module as T;
    }

    // Synchronous require for non-serverless environments
    let module: ProviderModule;
    
    switch (provider) {
      case 'openai':
        module = require('../client/openai');
        break;
      case 'anthropic':
        module = require('../client/anthropic');
        break;
      case 'gemini':
        module = require('../client/gemini');
        break;
      case 'bedrock':
        module = require('../client/bedrock');
        break;
      case 'azure-openai':
        module = require('../client/azure-openai');
        break;
      case 'cohere':
        module = require('../client/cohere');
        break;
      case 'mistral':
        module = require('../client/mistral');
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    // Cache the module
    if (this.config.cache) {
      this.loadedProviders.set(provider, module);
    }

    return module as T;
  }

  /**
   * Dynamic import of provider module
   */
  private async importProvider(provider: ProviderName): Promise<ProviderModule> {
    switch (provider) {
      case 'openai':
        return import('../client/openai');
      case 'anthropic':
        return import('../client/anthropic');
      case 'gemini':
        return import('../client/gemini');
      case 'bedrock':
        return import('../client/bedrock');
      case 'azure-openai':
        return import('../client/azure-openai');
      case 'cohere':
        return import('../client/cohere');
      case 'mistral':
        return import('../client/mistral');
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  /**
   * Preload multiple providers
   */
  private async preloadProviders(providers: ProviderName[]): Promise<void> {
    await Promise.all(
      providers.map(provider => this.loadProvider(provider))
    );
  }

  /**
   * Check if a provider is loaded
   */
  public isProviderLoaded(provider: ProviderName): boolean {
    return this.loadedProviders.has(provider);
  }

  /**
   * Get list of loaded providers
   */
  public getLoadedProviders(): ProviderName[] {
    return Array.from(this.loadedProviders.keys());
  }

  /**
   * Clear cache for a specific provider
   */
  public clearProvider(provider: ProviderName): void {
    this.loadedProviders.delete(provider);
    this.loadingPromises.delete(provider);
  }

  /**
   * Clear all cached providers
   */
  public clearAll(): void {
    this.loadedProviders.clear();
    this.loadingPromises.clear();
  }

  /**
   * Get memory usage statistics
   */
  public getMemoryStats(): {
    loadedCount: number;
    loadingCount: number;
    providers: ProviderName[];
  } {
    return {
      loadedCount: this.loadedProviders.size,
      loadingCount: this.loadingPromises.size,
      providers: this.getLoadedProviders()
    };
  }
}

/**
 * Convenience function to get LazyLoader instance
 */
export function getLazyLoader(config?: LazyLoaderConfig): LazyLoader {
  return LazyLoader.getInstance(config);
}

/**
 * Convenience function to load a provider
 */
export async function loadProvider<T = any>(
  provider: ProviderName,
  config?: LazyLoaderConfig
): Promise<T> {
  const loader = getLazyLoader(config);
  return loader.loadProvider<T>(provider);
}
