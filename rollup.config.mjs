import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import terser from '@rollup/plugin-terser';
import analyzer from 'rollup-plugin-analyzer';

const isAnalyze = process.env.ANALYZE === 'true';

// External dependencies that should not be bundled
const external = [
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
      file: 'dist/index.esm.js',
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
      file: `dist/providers/${name}.esm.js`,
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
      file: 'dist/serverless.esm.js',
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
  ...providerConfigs,
  serverlessConfig
];
