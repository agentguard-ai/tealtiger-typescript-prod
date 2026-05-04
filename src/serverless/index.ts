/**
 * TealTiger SDK - Serverless Module
 * 
 * This module provides serverless-optimized functionality including
 * lazy loading, singleton patterns, and configuration caching for
 * optimal cold start performance.
 * 
 * Requirements: 1.2, 1.3, 1.6
 */

export {
  LazyLoader,
  getLazyLoader,
  loadProvider
} from './LazyLoader';

export type {
  ProviderName,
  LazyLoaderConfig,
  ProviderModule
} from './LazyLoader';

export {
  SingletonFactory,
  getSingletonFactory,
  getClient
} from './SingletonFactory';

export type {
  AnyClientConfig,
  ProviderClient,
  SingletonFactoryConfig
} from './SingletonFactory';

export {
  ConfigCache,
  getConfigCache,
  cacheConfig
} from './ConfigCache';

export type {
  ConfigCacheConfig,
  CacheStats
} from './ConfigCache';

export {
  ServerlessOptimizer,
  getServerlessOptimizer,
  optimizeForServerless
} from './ServerlessOptimizer';

export type {
  ServerlessPlatform,
  OptimizationConfig,
  OptimizedBuild,
  BuildValidation
} from './ServerlessOptimizer';

export {
  ColdStartOptimizer,
  getColdStartOptimizer,
  PerformanceMeasurement,
  createPerformanceMeasurement
} from './ColdStartOptimizer';

export type {
  ConnectionPoolConfig,
  EnvironmentConfig,
  PerformanceMetrics
} from './ColdStartOptimizer';

export {
  CloudConfigLoader,
  getCloudConfigLoader,
  loadFromS3,
  loadFromGCS,
  loadFromAzureBlob
} from './CloudConfigLoader';

export type {
  CloudProvider,
  CloudStorageConfig,
  ConfigLoadResult
} from './CloudConfigLoader';
