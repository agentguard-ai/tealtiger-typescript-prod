/**
 * CloudConfigLoader Tests
 * 
 * Tests for cloud storage configuration loading
 */

import {
  CloudConfigLoader,
  getCloudConfigLoader,
  loadFromS3,
  loadFromGCS,
  loadFromAzureBlob,
  type CloudStorageConfig
} from '../serverless/CloudConfigLoader';
import { ConfigCache } from '../serverless/ConfigCache';

describe('CloudConfigLoader', () => {
  beforeEach(() => {
    CloudConfigLoader.reset();
    ConfigCache.reset();
    // Clear test environment variables
    delete process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON;
    delete process.env.GCS_CONFIG_TEST_BUCKET_CONFIG_JSON;
    delete process.env.AZURE_CONFIG_TEST_CONTAINER_CONFIG_JSON;
  });

  afterEach(() => {
    CloudConfigLoader.reset();
    ConfigCache.reset();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const loader1 = CloudConfigLoader.getInstance();
      const loader2 = CloudConfigLoader.getInstance();
      expect(loader1).toBe(loader2);
    });

    it('should reset singleton instance', () => {
      const loader1 = CloudConfigLoader.getInstance();
      CloudConfigLoader.reset();
      const loader2 = CloudConfigLoader.getInstance();
      expect(loader1).not.toBe(loader2);
    });
  });

  describe('S3 Configuration Loading', () => {
    it('should load configuration from S3 via environment variable', async () => {
      const testConfig = { provider: 'openai', model: 'gpt-4' };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.config).toEqual(testConfig);
      expect(result.provider).toBe('s3');
      expect(result.source).toBe('s3://test-bucket/config.json');
    });

    it('should use loadFromS3 convenience method', async () => {
      const testConfig = { provider: 'openai' };
      process.env.S3_CONFIG_MY_BUCKET_APP_CONFIG_JSON = JSON.stringify(testConfig);

      const config = await loadFromS3('my-bucket', 'app-config.json');
      expect(config).toEqual(testConfig);
    });

    it('should throw error when S3 SDK not available and no env var', async () => {
      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 's3',
          bucket: 'test-bucket',
          key: 'config.json'
        })
      ).rejects.toThrow('S3 configuration loading not available');
    });

    it('should handle invalid JSON in environment variable', async () => {
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = 'invalid-json';

      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 's3',
          bucket: 'test-bucket',
          key: 'config.json'
        })
      ).rejects.toThrow('Failed to parse S3 config');
    });
  });

  describe('GCS Configuration Loading', () => {
    it('should load configuration from GCS via environment variable', async () => {
      const testConfig = { provider: 'gemini', model: 'gemini-pro' };
      process.env.GCS_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 'gcs',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.config).toEqual(testConfig);
      expect(result.provider).toBe('gcs');
      expect(result.source).toBe('gcs://test-bucket/config.json');
    });

    it('should use loadFromGCS convenience method', async () => {
      const testConfig = { provider: 'gemini' };
      process.env.GCS_CONFIG_MY_BUCKET_APP_CONFIG_JSON = JSON.stringify(testConfig);

      const config = await loadFromGCS('my-bucket', 'app-config.json');
      expect(config).toEqual(testConfig);
    });

    it('should throw error when GCS SDK not available and no env var', async () => {
      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 'gcs',
          bucket: 'test-bucket',
          key: 'config.json'
        })
      ).rejects.toThrow('GCS configuration loading not available');
    });
  });

  describe('Azure Blob Configuration Loading', () => {
    it('should load configuration from Azure Blob via environment variable', async () => {
      const testConfig = { provider: 'azure-openai', model: 'gpt-4' };
      process.env.AZURE_CONFIG_TEST_CONTAINER_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 'azure-blob',
        bucket: 'test-container',
        key: 'config.json'
      });

      expect(result.config).toEqual(testConfig);
      expect(result.provider).toBe('azure-blob');
      expect(result.source).toBe('azure-blob://test-container/config.json');
    });

    it('should use loadFromAzureBlob convenience method', async () => {
      const testConfig = { provider: 'azure-openai' };
      process.env.AZURE_CONFIG_MY_CONTAINER_APP_CONFIG_JSON = JSON.stringify(testConfig);

      const config = await loadFromAzureBlob('my-container', 'app-config.json');
      expect(config).toEqual(testConfig);
    });

    it('should throw error when Azure SDK not available and no env var', async () => {
      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 'azure-blob',
          bucket: 'test-container',
          key: 'config.json'
        })
      ).rejects.toThrow('Azure Blob configuration loading not available');
    });
  });

  describe('Caching', () => {
    it('should cache loaded configurations', async () => {
      const testConfig = { provider: 'openai', cached: true };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();

      // First load
      const result1 = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json',
        cache: true
      });

      // Second load (should be from cache)
      const result2 = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json',
        cache: true
      });

      expect(result1.config).toEqual(testConfig);
      expect(result2.config).toEqual(testConfig);
      // Second load should be faster (from cache)
      expect(result2.loadTime).toBeLessThanOrEqual(result1.loadTime);
    });

    it('should not cache when caching is disabled', async () => {
      const testConfig = { provider: 'openai', cached: false };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();

      const result = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json',
        cache: false
      });

      expect(result.config).toEqual(testConfig);
      expect(result.fromCache).toBe(false);
    });

    it('should invalidate cached configuration', async () => {
      const testConfig = { provider: 'openai' };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const config: CloudStorageConfig = {
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json'
      };

      // Load and cache
      await loader.loadConfig(config);

      // Invalidate cache
      loader.invalidateCache(config);

      // Next load should not be from cache
      const result = await loader.loadConfig(config);
      expect(result.fromCache).toBe(false);
    });

    it('should clear all cached configurations', async () => {
      const testConfig1 = { provider: 'openai' };
      const testConfig2 = { provider: 'anthropic' };
      
      process.env.S3_CONFIG_BUCKET1_CONFIG_JSON = JSON.stringify(testConfig1);
      process.env.S3_CONFIG_BUCKET2_CONFIG_JSON = JSON.stringify(testConfig2);

      const loader = CloudConfigLoader.getInstance();

      // Load and cache multiple configs
      await loader.loadConfig({
        provider: 's3',
        bucket: 'bucket1',
        key: 'config.json'
      });

      await loader.loadConfig({
        provider: 's3',
        bucket: 'bucket2',
        key: 'config.json'
      });

      // Clear all cache
      loader.clearCache();

      // Next loads should not be from cache
      const result1 = await loader.loadConfig({
        provider: 's3',
        bucket: 'bucket1',
        key: 'config.json'
      });

      expect(result1.fromCache).toBe(false);
    });
  });

  describe('Load Result', () => {
    it('should include load time in result', async () => {
      const testConfig = { provider: 'openai' };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.loadTime).toBeGreaterThanOrEqual(0);
    });

    it('should include provider in result', async () => {
      const testConfig = { provider: 'openai' };
      process.env.GCS_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 'gcs',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.provider).toBe('gcs');
    });

    it('should include source location in result', async () => {
      const testConfig = { provider: 'openai' };
      process.env.AZURE_CONFIG_MY_CONTAINER_MY_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 'azure-blob',
        bucket: 'my-container',
        key: 'my-config.json'
      });

      expect(result.source).toBe('azure-blob://my-container/my-config.json');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported provider', async () => {
      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 'unsupported' as any,
          bucket: 'test-bucket',
          key: 'config.json'
        })
      ).rejects.toThrow('Unsupported cloud provider');
    });

    it('should handle missing configuration gracefully', async () => {
      const loader = CloudConfigLoader.getInstance();

      await expect(
        loader.loadConfig({
          provider: 's3',
          bucket: 'nonexistent-bucket',
          key: 'nonexistent-key.json'
        })
      ).rejects.toThrow();
    });
  });

  describe('Convenience Functions', () => {
    it('should work with getCloudConfigLoader', () => {
      const loader1 = getCloudConfigLoader();
      const loader2 = getCloudConfigLoader();
      expect(loader1).toBe(loader2);
    });

    it('should work with loadFromS3', async () => {
      const testConfig = { test: 'value' };
      process.env.S3_CONFIG_BUCKET_KEY_JSON = JSON.stringify(testConfig);

      const config = await loadFromS3('bucket', 'key.json');
      expect(config).toEqual(testConfig);
    });

    it('should work with loadFromGCS', async () => {
      const testConfig = { test: 'value' };
      process.env.GCS_CONFIG_BUCKET_KEY_JSON = JSON.stringify(testConfig);

      const config = await loadFromGCS('bucket', 'key.json');
      expect(config).toEqual(testConfig);
    });

    it('should work with loadFromAzureBlob', async () => {
      const testConfig = { test: 'value' };
      process.env.AZURE_CONFIG_CONTAINER_BLOB_JSON = JSON.stringify(testConfig);

      const config = await loadFromAzureBlob('container', 'blob.json');
      expect(config).toEqual(testConfig);
    });
  });

  describe('Complex Configurations', () => {
    it('should handle nested configuration objects', async () => {
      const testConfig = {
        provider: 'openai',
        options: {
          temperature: 0.7,
          maxTokens: 100,
          nested: {
            value: 'test'
          }
        }
      };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.config).toEqual(testConfig);
    });

    it('should handle array configurations', async () => {
      const testConfig = {
        providers: ['openai', 'anthropic', 'gemini'],
        models: [
          { name: 'gpt-4', provider: 'openai' },
          { name: 'claude-3', provider: 'anthropic' }
        ]
      };
      process.env.S3_CONFIG_TEST_BUCKET_CONFIG_JSON = JSON.stringify(testConfig);

      const loader = CloudConfigLoader.getInstance();
      const result = await loader.loadConfig({
        provider: 's3',
        bucket: 'test-bucket',
        key: 'config.json'
      });

      expect(result.config).toEqual(testConfig);
    });
  });
});
