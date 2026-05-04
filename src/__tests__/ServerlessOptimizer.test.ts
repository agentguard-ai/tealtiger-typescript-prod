/**
 * ServerlessOptimizer Tests
 * 
 * Tests for serverless build pipeline and optimization
 */

import {
  ServerlessOptimizer,
  getServerlessOptimizer,
  optimizeForServerless,
  type OptimizationConfig,
  type ServerlessPlatform
} from '../serverless/ServerlessOptimizer';

describe('ServerlessOptimizer', () => {
  let optimizer: ServerlessOptimizer;

  beforeEach(() => {
    optimizer = ServerlessOptimizer.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance', () => {
      const optimizer1 = ServerlessOptimizer.getInstance();
      const optimizer2 = ServerlessOptimizer.getInstance();
      expect(optimizer1).toBe(optimizer2);
    });
  });

  describe('Build Optimization', () => {
    it('should optimize for Lambda platform', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai', 'anthropic']
      };

      const build = await optimizer.optimize(config);

      expect(build.packagePath).toBeDefined();
      expect(build.size).toBeGreaterThan(0);
      expect(build.coldStartTime).toBeGreaterThan(0);
      expect(build.providers).toEqual(['openai', 'anthropic']);
      expect(build.entryPoints).toHaveProperty('openai');
      expect(build.entryPoints).toHaveProperty('anthropic');
      expect(build.metadata.target).toBe('lambda');
    });

    it('should optimize for Azure Functions', async () => {
      const config: OptimizationConfig = {
        target: 'azure-functions',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);

      expect(build.metadata.target).toBe('azure-functions');
      expect(build.providers).toEqual(['openai']);
    });

    it('should optimize for Cloud Functions', async () => {
      const config: OptimizationConfig = {
        target: 'cloud-functions',
        providers: ['gemini']
      };

      const build = await optimizer.optimize(config);

      expect(build.metadata.target).toBe('cloud-functions');
      expect(build.providers).toEqual(['gemini']);
    });

    it('should optimize for edge platforms', async () => {
      const config: OptimizationConfig = {
        target: 'edge',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);

      expect(build.metadata.target).toBe('edge');
      expect(build.size).toBeLessThan(10 * 1024 * 1024); // Should be under 10MB
    });

    it('should include all specified providers', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai', 'anthropic', 'gemini', 'bedrock']
      };

      const build = await optimizer.optimize(config);

      expect(build.providers).toHaveLength(4);
      expect(build.providers).toContain('openai');
      expect(build.providers).toContain('anthropic');
      expect(build.providers).toContain('gemini');
      expect(build.providers).toContain('bedrock');
    });
  });

  describe('Build Validation', () => {
    it('should validate successful builds', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);
      const validation = optimizer.validateBuild(build);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.sizeCheck.passed).toBe(true);
    });

    it('should detect oversized packages', async () => {
      const config: OptimizationConfig = {
        target: 'edge',
        providers: ['openai', 'anthropic', 'gemini', 'bedrock', 'cohere', 'mistral']
      };

      const build = await optimizer.optimize(config);
      
      // Manually set size to exceed limit for testing
      build.size = 10 * 1024 * 1024; // 10MB (edge limit is 5MB)
      
      const validation = optimizer.validateBuild(build);

      expect(validation.sizeCheck.passed).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('should warn about slow cold starts', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);
      
      // Manually set cold start time to exceed limit
      build.coldStartTime = 600; // 600ms (limit is 500ms)
      
      const validation = optimizer.validateBuild(build);

      expect(validation.coldStartCheck?.passed).toBe(false);
      expect(validation.warnings.length).toBeGreaterThan(0);
    });

    it('should detect missing providers', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: []
      };

      await expect(optimizer.optimize(config)).rejects.toThrow(
        'At least one provider is required'
      );
    });

    it('should detect missing entry points', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);
      
      // Remove entry point for testing
      delete build.entryPoints['openai'];
      
      const validation = optimizer.validateBuild(build);

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain('Missing entry point for provider: openai');
    });
  });

  describe('Platform Configuration', () => {
    it('should generate Lambda build config', () => {
      const config = optimizer.generateBuildConfig('lambda');

      expect(config.target).toBe('lambda');
      expect(config.lambda).toBeDefined();
      expect(config.lambda.runtime).toBe('nodejs20.x');
      expect(config.lambda.handler).toBe('index.handler');
    });

    it('should generate Azure Functions build config', () => {
      const config = optimizer.generateBuildConfig('azure-functions');

      expect(config.target).toBe('azure-functions');
      expect(config.azureFunctions).toBeDefined();
      expect(config.azureFunctions.runtime).toBe('node');
    });

    it('should generate Cloud Functions build config', () => {
      const config = optimizer.generateBuildConfig('cloud-functions');

      expect(config.target).toBe('cloud-functions');
      expect(config.cloudFunctions).toBeDefined();
      expect(config.cloudFunctions.runtime).toBe('nodejs20');
    });

    it('should generate edge build config', () => {
      const config = optimizer.generateBuildConfig('edge');

      expect(config.target).toBe('edge');
      expect(config.edge).toBeDefined();
      expect(config.edge.format).toBe('esm');
    });

    it('should get platform configuration', () => {
      const platformConfig = optimizer.getPlatformConfig('lambda');

      expect(platformConfig.maxSize).toBe(50 * 1024 * 1024);
      expect(platformConfig.maxColdStart).toBe(500);
      expect(platformConfig.runtime).toBe('nodejs20.x');
    });
  });

  describe('Size Estimation', () => {
    it('should estimate size reduction from optimizations', () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: true,
        treeShaking: true,
        codeSplitting: true,
        includeExamples: false
      };

      const reduction = optimizer.estimateSizeReduction(config);

      expect(reduction).toBeGreaterThan(0);
      expect(reduction).toBeLessThanOrEqual(70);
    });

    it('should estimate higher reduction with fewer providers', () => {
      const config1: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: true,
        treeShaking: true
      };

      const config2: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai', 'anthropic', 'gemini', 'bedrock'],
        minify: true,
        treeShaking: true
      };

      const reduction1 = optimizer.estimateSizeReduction(config1);
      const reduction2 = optimizer.estimateSizeReduction(config2);

      // With fewer providers, we should get more reduction (or equal if capped)
      expect(reduction1).toBeGreaterThanOrEqual(reduction2);
    });

    it('should estimate lower reduction without optimizations', () => {
      const config1: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: true,
        treeShaking: true,
        codeSplitting: true
      };

      const config2: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: false,
        treeShaking: false,
        codeSplitting: false
      };

      const reduction1 = optimizer.estimateSizeReduction(config1);
      const reduction2 = optimizer.estimateSizeReduction(config2);

      expect(reduction1).toBeGreaterThan(reduction2);
    });
  });

  describe('Package Size Constraint', () => {
    it('should produce packages under 10MB for serverless platforms', async () => {
      const platforms: ServerlessPlatform[] = ['lambda', 'azure-functions', 'cloud-functions'];

      for (const platform of platforms) {
        const config: OptimizationConfig = {
          target: platform,
          providers: ['openai', 'anthropic']
        };

        const build = await optimizer.optimize(config);

        expect(build.size).toBeLessThan(10 * 1024 * 1024); // <10MB
      }
    });

    it('should produce smaller packages for edge platforms', async () => {
      const config: OptimizationConfig = {
        target: 'edge',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);

      expect(build.size).toBeLessThan(5 * 1024 * 1024); // <5MB for edge
    });

    it('should meet cold start time requirements', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);

      expect(build.coldStartTime).toBeLessThan(500); // <500ms
    });
  });

  describe('Configuration Validation', () => {
    it('should reject missing target', async () => {
      const config = {
        providers: ['openai']
      } as OptimizationConfig;

      await expect(optimizer.optimize(config)).rejects.toThrow(
        'Target platform is required'
      );
    });

    it('should reject invalid platform', async () => {
      const config = {
        target: 'invalid-platform',
        providers: ['openai']
      } as any;

      await expect(optimizer.optimize(config)).rejects.toThrow(
        'Unsupported platform'
      );
    });

    it('should reject empty providers list', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: []
      };

      await expect(optimizer.optimize(config)).rejects.toThrow(
        'At least one provider is required'
      );
    });

    it('should reject invalid providers', async () => {
      const config = {
        target: 'lambda' as ServerlessPlatform,
        providers: ['invalid-provider']
      } as any;

      await expect(optimizer.optimize(config)).rejects.toThrow(
        'Invalid provider'
      );
    });
  });

  describe('Entry Point Generation', () => {
    it('should generate entry points for all providers', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai', 'anthropic', 'gemini']
      };

      const build = await optimizer.optimize(config);

      expect(Object.keys(build.entryPoints)).toHaveLength(3);
      expect(build.entryPoints['openai']).toBeDefined();
      expect(build.entryPoints['anthropic']).toBeDefined();
      expect(build.entryPoints['gemini']).toBeDefined();
    });

    it('should generate different entry points for edge platforms', async () => {
      const config: OptimizationConfig = {
        target: 'edge',
        providers: ['openai']
      };

      const build = await optimizer.optimize(config);

      expect(build.entryPoints['openai']).toContain('export');
    });
  });

  describe('Build Metadata', () => {
    it('should include build metadata', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: true,
        treeShaking: true,
        codeSplitting: true
      };

      const build = await optimizer.optimize(config);

      expect(build.metadata).toBeDefined();
      expect(build.metadata.target).toBe('lambda');
      expect(build.metadata.buildTime).toBeGreaterThanOrEqual(0);
      expect(build.metadata.minified).toBe(true);
      expect(build.metadata.treeShaken).toBe(true);
      expect(build.metadata.codeSplit).toBe(true);
    });

    it('should track optimization flags', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai'],
        minify: false,
        treeShaking: false,
        codeSplitting: false
      };

      const build = await optimizer.optimize(config);

      expect(build.metadata.minified).toBe(false);
      expect(build.metadata.treeShaken).toBe(false);
      expect(build.metadata.codeSplit).toBe(false);
    });
  });

  describe('Convenience Functions', () => {
    it('should work with getServerlessOptimizer', () => {
      const optimizer1 = getServerlessOptimizer();
      const optimizer2 = getServerlessOptimizer();
      expect(optimizer1).toBe(optimizer2);
    });

    it('should work with optimizeForServerless', async () => {
      const config: OptimizationConfig = {
        target: 'lambda',
        providers: ['openai']
      };

      const build = await optimizeForServerless(config);

      expect(build).toBeDefined();
      expect(build.providers).toEqual(['openai']);
    });
  });
});
