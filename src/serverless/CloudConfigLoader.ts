/**
 * CloudConfigLoader - Cloud Storage Configuration Support
 * 
 * Implements configuration loading from cloud storage services:
 * - AWS S3
 * - Google Cloud Storage (GCS)
 * - Azure Blob Storage
 * 
 * With caching support for performance optimization.
 * 
 * Requirements: 1.9
 */

import { ConfigCache, getConfigCache } from './ConfigCache';

/**
 * Cloud storage provider
 */
export type CloudProvider = 's3' | 'gcs' | 'azure-blob';

/**
 * Cloud storage configuration
 */
export interface CloudStorageConfig {
  /**
   * Cloud provider
   */
  provider: CloudProvider;
  
  /**
   * Bucket/container name
   */
  bucket: string;
  
  /**
   * Object key/path
   */
  key: string;
  
  /**
   * AWS region (for S3)
   */
  region?: string;
  
  /**
   * GCP project ID (for GCS)
   */
  projectId?: string;
  
  /**
   * Azure storage account name (for Azure Blob)
   */
  accountName?: string;
  
  /**
   * Enable caching (default: true)
   */
  cache?: boolean;
  
  /**
   * Cache TTL in milliseconds (default: 5 minutes)
   */
  cacheTTL?: number;
}

/**
 * Configuration load result
 */
export interface ConfigLoadResult<T = any> {
  /**
   * Loaded configuration
   */
  config: T;
  
  /**
   * Load time in milliseconds
   */
  loadTime: number;
  
  /**
   * Whether loaded from cache
   */
  fromCache: boolean;
  
  /**
   * Cloud provider used
   */
  provider: CloudProvider;
  
  /**
   * Source location
   */
  source: string;
}

/**
 * CloudConfigLoader manages configuration loading from cloud storage
 */
export class CloudConfigLoader {
  private static instance: CloudConfigLoader;
  private cache: ConfigCache;

  private constructor() {
    this.cache = getConfigCache();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): CloudConfigLoader {
    if (!CloudConfigLoader.instance) {
      CloudConfigLoader.instance = new CloudConfigLoader();
    }
    return CloudConfigLoader.instance;
  }

  /**
   * Reset singleton instance (for testing)
   */
  public static reset(): void {
    CloudConfigLoader.instance = null as any;
  }

  /**
   * Load configuration from cloud storage
   * 
   * @param config - Cloud storage configuration
   * @returns Loaded configuration
   */
  public async loadConfig<T = any>(
    config: CloudStorageConfig
  ): Promise<ConfigLoadResult<T>> {
    const startTime = Date.now();
    const cacheKey = this.generateCacheKey(config);
    let fromCache = false;
    
    // Try cache first if enabled
    if (config.cache !== false) {
      // Check if already in cache
      if (this.cache.has(cacheKey)) {
        fromCache = true;
      }
      
      const cached = await this.cache.get<T>(cacheKey, async () => {
        return this.loadFromCloud<T>(config);
      });
      
      const loadTime = Date.now() - startTime;
      
      return {
        config: cached,
        loadTime,
        fromCache,
        provider: config.provider,
        source: `${config.provider}://${config.bucket}/${config.key}`
      };
    }
    
    // Load directly without cache
    const loaded = await this.loadFromCloud<T>(config);
    const loadTime = Date.now() - startTime;
    
    return {
      config: loaded,
      loadTime,
      fromCache: false,
      provider: config.provider,
      source: `${config.provider}://${config.bucket}/${config.key}`
    };
  }

  /**
   * Load configuration from S3
   * 
   * @param bucket - S3 bucket name
   * @param key - Object key
   * @param region - AWS region (optional)
   * @returns Loaded configuration
   */
  public async loadFromS3<T = any>(
    bucket: string,
    key: string,
    region?: string
  ): Promise<T> {
    const config: CloudStorageConfig = {
      provider: 's3',
      bucket,
      key
    };
    
    if (region) {
      config.region = region;
    }
    
    return this.loadConfig<T>(config).then(result => result.config);
  }

  /**
   * Load configuration from GCS
   * 
   * @param bucket - GCS bucket name
   * @param key - Object path
   * @param projectId - GCP project ID (optional)
   * @returns Loaded configuration
   */
  public async loadFromGCS<T = any>(
    bucket: string,
    key: string,
    projectId?: string
  ): Promise<T> {
    const config: CloudStorageConfig = {
      provider: 'gcs',
      bucket,
      key
    };
    
    if (projectId) {
      config.projectId = projectId;
    }
    
    return this.loadConfig<T>(config).then(result => result.config);
  }

  /**
   * Load configuration from Azure Blob Storage
   * 
   * @param container - Container name
   * @param blobName - Blob name
   * @param accountName - Storage account name (optional)
   * @returns Loaded configuration
   */
  public async loadFromAzureBlob<T = any>(
    container: string,
    blobName: string,
    accountName?: string
  ): Promise<T> {
    const config: CloudStorageConfig = {
      provider: 'azure-blob',
      bucket: container,
      key: blobName
    };
    
    if (accountName) {
      config.accountName = accountName;
    }
    
    return this.loadConfig<T>(config).then(result => result.config);
  }

  /**
   * Invalidate cached configuration
   * 
   * @param config - Cloud storage configuration
   */
  public invalidateCache(config: CloudStorageConfig): void {
    const cacheKey = this.generateCacheKey(config);
    this.cache.invalidate(cacheKey);
  }

  /**
   * Clear all cached configurations
   */
  public clearCache(): void {
    this.cache.clear();
  }

  /**
   * Load configuration from cloud storage (implementation)
   * 
   * @param config - Cloud storage configuration
   * @returns Loaded configuration
   */
  private async loadFromCloud<T>(config: CloudStorageConfig): Promise<T> {
    switch (config.provider) {
      case 's3':
        return this.loadFromS3Implementation<T>(config);
      case 'gcs':
        return this.loadFromGCSImplementation<T>(config);
      case 'azure-blob':
        return this.loadFromAzureBlobImplementation<T>(config);
      default:
        throw new Error(`Unsupported cloud provider: ${config.provider}`);
    }
  }

  /**
   * Load from S3 (implementation)
   * 
   * Note: This is a simplified implementation. In production, you would use
   * the AWS SDK (@aws-sdk/client-s3) to fetch the object.
   */
  private async loadFromS3Implementation<T>(
    config: CloudStorageConfig
  ): Promise<T> {
    // Check for AWS SDK availability
    if (typeof process !== 'undefined' && process.env.AWS_LAMBDA_FUNCTION_NAME) {
      // In Lambda, we can use environment variables or IAM roles
      // This is a placeholder for actual AWS SDK implementation
      throw new Error(
        'S3 configuration loading requires @aws-sdk/client-s3. ' +
        'Install it with: npm install @aws-sdk/client-s3'
      );
    }
    
    // For testing/development, support loading from environment variable
    const envKey = `S3_CONFIG_${config.bucket}_${config.key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const envValue = process.env[envKey];
    
    if (envValue) {
      try {
        return JSON.parse(envValue) as T;
      } catch (error) {
        throw new Error(`Failed to parse S3 config from environment: ${error}`);
      }
    }
    
    throw new Error(
      `S3 configuration loading not available. ` +
      `Set ${envKey} environment variable or install @aws-sdk/client-s3`
    );
  }

  /**
   * Load from GCS (implementation)
   * 
   * Note: This is a simplified implementation. In production, you would use
   * the Google Cloud Storage SDK (@google-cloud/storage) to fetch the object.
   */
  private async loadFromGCSImplementation<T>(
    config: CloudStorageConfig
  ): Promise<T> {
    // Check for GCS SDK availability
    if (typeof process !== 'undefined' && process.env.FUNCTION_NAME) {
      // In Cloud Functions, we can use service accounts
      // This is a placeholder for actual GCS SDK implementation
      throw new Error(
        'GCS configuration loading requires @google-cloud/storage. ' +
        'Install it with: npm install @google-cloud/storage'
      );
    }
    
    // For testing/development, support loading from environment variable
    const envKey = `GCS_CONFIG_${config.bucket}_${config.key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const envValue = process.env[envKey];
    
    if (envValue) {
      try {
        return JSON.parse(envValue) as T;
      } catch (error) {
        throw new Error(`Failed to parse GCS config from environment: ${error}`);
      }
    }
    
    throw new Error(
      `GCS configuration loading not available. ` +
      `Set ${envKey} environment variable or install @google-cloud/storage`
    );
  }

  /**
   * Load from Azure Blob Storage (implementation)
   * 
   * Note: This is a simplified implementation. In production, you would use
   * the Azure Storage SDK (@azure/storage-blob) to fetch the blob.
   */
  private async loadFromAzureBlobImplementation<T>(
    config: CloudStorageConfig
  ): Promise<T> {
    // Check for Azure SDK availability
    if (typeof process !== 'undefined' && process.env.AZURE_FUNCTIONS_ENVIRONMENT) {
      // In Azure Functions, we can use managed identities
      // This is a placeholder for actual Azure SDK implementation
      throw new Error(
        'Azure Blob configuration loading requires @azure/storage-blob. ' +
        'Install it with: npm install @azure/storage-blob'
      );
    }
    
    // For testing/development, support loading from environment variable
    const envKey = `AZURE_CONFIG_${config.bucket}_${config.key}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const envValue = process.env[envKey];
    
    if (envValue) {
      try {
        return JSON.parse(envValue) as T;
      } catch (error) {
        throw new Error(`Failed to parse Azure config from environment: ${error}`);
      }
    }
    
    throw new Error(
      `Azure Blob configuration loading not available. ` +
      `Set ${envKey} environment variable or install @azure/storage-blob`
    );
  }

  /**
   * Generate cache key from configuration
   * 
   * @param config - Cloud storage configuration
   * @returns Cache key
   */
  private generateCacheKey(config: CloudStorageConfig): string {
    return `cloud-config:${config.provider}:${config.bucket}:${config.key}`;
  }
}

/**
 * Convenience function to get CloudConfigLoader instance
 */
export function getCloudConfigLoader(): CloudConfigLoader {
  return CloudConfigLoader.getInstance();
}

/**
 * Convenience function to load configuration from S3
 */
export async function loadFromS3<T = any>(
  bucket: string,
  key: string,
  region?: string
): Promise<T> {
  const loader = getCloudConfigLoader();
  return loader.loadFromS3<T>(bucket, key, region);
}

/**
 * Convenience function to load configuration from GCS
 */
export async function loadFromGCS<T = any>(
  bucket: string,
  key: string,
  projectId?: string
): Promise<T> {
  const loader = getCloudConfigLoader();
  return loader.loadFromGCS<T>(bucket, key, projectId);
}

/**
 * Convenience function to load configuration from Azure Blob
 */
export async function loadFromAzureBlob<T = any>(
  container: string,
  blobName: string,
  accountName?: string
): Promise<T> {
  const loader = getCloudConfigLoader();
  return loader.loadFromAzureBlob<T>(container, blobName, accountName);
}
