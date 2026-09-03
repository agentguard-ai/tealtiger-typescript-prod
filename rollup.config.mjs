import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import analyzer from 'rollup-plugin-analyzer';
import { builtinModules } from 'module';
import { minify } from 'terser';

const terser = (options = {}) => ({
  name: 'terser',
  async renderChunk(code, _chunk, outputOptions) {
    const result = await minify(code, {
      ...options,
      sourceMap: outputOptions.sourcemap === true || typeof outputOptions.sourcemap === 'string',
      module: outputOptions.format === 'es',
      toplevel: outputOptions.format === 'cjs'
    });

    return {
      code: result.code || code,
      map: result.map ? JSON.parse(result.map) : null
    };
  }
});

const isAnalyze = process.env.ANALYZE === 'true';
const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`]);

// External dependencies that should not be bundled
const external = [
  ...nodeBuiltins,
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
  '@aws-sdk/client-bedrock-runtime',
  '@azure/openai',
  'cohere-ai',
  '@mistralai/mistralai',
  'axios',
  'uuid'
];

// Common plugins for all builds
const commonPlugins = [
  resolve({
    preferBuiltins: true,
    exportConditions: ['node']
  }),
  commonjs(),
  json(),
  typescript({
    tsconfig: './tsconfig.json',
    // Rollup can only bundle when TypeScript emits ES modules; the shared
    // tsconfig targets CommonJS (for tsc type emit + tests), so override it
    // here. Without this, every internal `./` import is left as a runtime
    // require() and the published bundle breaks (e.g. `Cannot find module
    // './observe'`).
    compilerOptions: {
      module: 'ESNext'
    },
    declaration: false,
    declarationMap: false,
    sourceMap: true,
    exclude: ['**/*.test.ts', '**/__tests__/**']
  })
];

// Terser configuration for minification
const terserConfig = {
  compress: {
    drop_console: false,
    drop_debugger: true,
    pure_funcs: ['console.debug']
  },
  mangle: {
    keep_classnames: true,
    keep_fnames: true
  },
  format: {
    comments: false
  }
};

// Main bundle configuration
const mainConfig = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/index.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: 'dist/index.mjs',
      format: 'esm',
      sourcemap: true
    }
  ],
  external,
  plugins: [
    ...commonPlugins,
    terser(terserConfig),
    ...(isAnalyze ? [analyzer({ summaryOnly: true, limit: 20 })] : [])
  ],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false
  }
};

const observeConfig = {
  input: 'src/observe/format-cost.ts',
  output: [
    {
      file: 'dist/subpaths/observe.js',
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: 'dist/subpaths/observe.esm.js',
      format: 'esm',
      sourcemap: true
    }
  ],
  external,
  plugins: [...commonPlugins, terser(terserConfig)],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false
  }
};

// Provider-specific bundle configurations
const providerConfigs = [
  {
    name: 'openai',
    input: 'src/providers/openai.ts',
    external: [...external]
  },
  {
    name: 'anthropic',
    input: 'src/providers/anthropic.ts',
    external: [...external]
  },
  {
    name: 'gemini',
    input: 'src/providers/gemini.ts',
    external: [...external]
  },
  {
    name: 'bedrock',
    input: 'src/providers/bedrock.ts',
    external: [...external]
  },
  {
    name: 'azure-openai',
    input: 'src/providers/azure-openai.ts',
    external: [...external]
  },
  {
    name: 'cohere',
    input: 'src/providers/cohere.ts',
    external: [...external]
  },
  {
    name: 'mistral',
    input: 'src/providers/mistral.ts',
    external: [...external]
  },
  {
    name: 'ollama',
    input: 'src/providers/ollama.ts',
    external: [...external]
  }
].map(({ name, input, external: providerExternal }) => ({
  input,
  output: [
    {
      file: `dist/providers/${name}.js`,
      format: 'cjs',
      sourcemap: true,
      exports: 'named'
    },
    {
      file: `dist/providers/${name}.mjs`,
      format: 'esm',
      sourcemap: true
    }
  ],
  external: providerExternal,
  plugins: [
    ...commonPlugins,
    terser(terserConfig),
    ...(isAnalyze ? [analyzer({ summaryOnly: true, limit: 10 })] : [])
  ],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false
  }
}));

// Serverless-optimized bundle (minimal, no dev dependencies)
const serverlessConfig = {
  input: 'src/index.ts',
  output: [
    {
      file: 'dist/serverless.js',
      format: 'cjs',
      sourcemap: false,
      exports: 'named'
    },
    {
      file: 'dist/serverless.mjs',
      format: 'esm',
      sourcemap: false
    }
  ],
  external,
  plugins: [
    ...commonPlugins,
    terser({
      ...terserConfig,
      compress: {
        ...terserConfig.compress,
        drop_console: true, // Remove all console logs for serverless
        passes: 3 // More aggressive optimization
      }
    }),
    ...(isAnalyze ? [analyzer({ summaryOnly: true, limit: 20 })] : [])
  ],
  treeshake: {
    moduleSideEffects: false,
    propertyReadSideEffects: false,
    unknownGlobalSideEffects: false,
    preset: 'smallest'
  }
};

export default [
  mainConfig,
  observeConfig,
  ...providerConfigs,
  serverlessConfig
];
