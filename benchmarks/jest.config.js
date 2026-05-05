/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        rootDir: '..',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        module: 'commonjs',
        target: 'ES2020',
        lib: ['ES2020'],
        noUnusedLocals: false,
        noUnusedParameters: false,
      },
    },
  },
};
