#!/usr/bin/env node

/**
 * Bundle Size Measurement Script
 * 
 * Measures and compares bundle sizes before and after tree-shaking optimization.
 * Validates that serverless builds meet the <10MB requirement.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BYTES_IN_MB = 1024 * 1024;
const MAX_SERVERLESS_SIZE_MB = 10;

/**
 * Get file size in bytes
 */
function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

/**
 * Format bytes to human-readable size
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Get directory size recursively
 */
function getDirectorySize(dirPath) {
  let totalSize = 0;
  
  if (!fs.existsSync(dirPath)) {
    return 0;
  }
  
  const files = fs.readdirSync(dirPath);
  
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      totalSize += getDirectorySize(filePath);
    } else {
      totalSize += stats.size;
    }
  }
  
  return totalSize;
}

/**
 * Measure bundle sizes
 */
function measureBundleSizes() {
  const distPath = path.join(__dirname, '..', 'dist');
  
  console.log('\n📦 TealTiger SDK Bundle Size Analysis\n');
  console.log('=' .repeat(70));
  
  // Main bundle
  const mainBundle = getFileSize(path.join(distPath, 'index.js'));
  const mainBundleESM = getFileSize(path.join(distPath, 'index.esm.js'));
  
  console.log('\n🎯 Main Bundle:');
  console.log(`   CommonJS: ${formatBytes(mainBundle)}`);
  console.log(`   ESM:      ${formatBytes(mainBundleESM)}`);
  
  // Serverless bundle
  const serverlessBundle = getFileSize(path.join(distPath, 'serverless.js'));
  const serverlessBundleESM = getFileSize(path.join(distPath, 'serverless.esm.js'));
  const serverlessSizeMB = serverlessBundle / BYTES_IN_MB;
  
  console.log('\n⚡ Serverless Bundle:');
  console.log(`   CommonJS: ${formatBytes(serverlessBundle)} (${serverlessSizeMB.toFixed(2)} MB)`);
  console.log(`   ESM:      ${formatBytes(serverlessBundleESM)}`);
  
  // Validate serverless size constraint
  if (serverlessSizeMB > MAX_SERVERLESS_SIZE_MB) {
    console.log(`   ❌ FAILED: Exceeds ${MAX_SERVERLESS_SIZE_MB}MB limit`);
  } else {
    console.log(`   ✅ PASSED: Under ${MAX_SERVERLESS_SIZE_MB}MB limit`);
  }
  
  // Provider-specific bundles
  console.log('\n🔌 Provider-Specific Bundles:');
  
  const providers = ['openai', 'anthropic', 'gemini', 'bedrock', 'azure-openai', 'cohere', 'mistral'];
  const providerSizes = {};
  
  for (const provider of providers) {
    const providerBundle = getFileSize(path.join(distPath, 'providers', `${provider}.js`));
    const providerBundleESM = getFileSize(path.join(distPath, 'providers', `${provider}.esm.js`));
    
    providerSizes[provider] = providerBundle;
    
    console.log(`   ${provider.padEnd(15)}: ${formatBytes(providerBundle)} (CJS) | ${formatBytes(providerBundleESM)} (ESM)`);
  }
  
  // Total dist size
  const totalDistSize = getDirectorySize(distPath);
  console.log('\n📊 Total Distribution Size:');
  console.log(`   ${formatBytes(totalDistSize)}`);
  
  // Calculate savings
  const avgProviderSize = Object.values(providerSizes).reduce((a, b) => a + b, 0) / providers.length;
  const savingsPercent = ((mainBundle - avgProviderSize) / mainBundle * 100).toFixed(1);
  
  console.log('\n💰 Tree-Shaking Savings:');
  console.log(`   Average provider bundle: ${formatBytes(avgProviderSize)}`);
  console.log(`   Savings vs main bundle:  ${savingsPercent}%`);
  
  // Size reduction validation
  const sizeReductionPercent = ((mainBundle - serverlessBundle) / mainBundle * 100);
  console.log('\n📉 Serverless Optimization:');
  console.log(`   Size reduction: ${sizeReductionPercent.toFixed(1)}%`);
  
  if (sizeReductionPercent >= 50) {
    console.log(`   ✅ PASSED: Meets 50% reduction requirement`);
  } else {
    console.log(`   ⚠️  WARNING: Below 50% reduction target`);
  }
  
  console.log('\n' + '='.repeat(70));
  
  // Generate JSON report
  const report = {
    timestamp: new Date().toISOString(),
    mainBundle: {
      cjs: mainBundle,
      esm: mainBundleESM
    },
    serverlessBundle: {
      cjs: serverlessBundle,
      esm: serverlessBundleESM,
      sizeMB: serverlessSizeMB,
      meetsConstraint: serverlessSizeMB <= MAX_SERVERLESS_SIZE_MB
    },
    providerBundles: providerSizes,
    totalDistSize,
    metrics: {
      avgProviderSize,
      savingsPercent: parseFloat(savingsPercent),
      sizeReductionPercent: parseFloat(sizeReductionPercent.toFixed(1)),
      meets50PercentReduction: sizeReductionPercent >= 50
    }
  };
  
  const reportPath = path.join(distPath, 'bundle-size-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}\n`);
  
  return report;
}

// Run measurement
try {
  const report = measureBundleSizes();
  
  // Exit with error if constraints not met
  if (!report.serverlessBundle.meetsConstraint) {
    console.error('❌ Bundle size validation failed: Serverless bundle exceeds 10MB limit\n');
    process.exit(1);
  }
  
  if (!report.metrics.meets50PercentReduction) {
    console.warn('⚠️  Warning: Serverless optimization below 50% reduction target\n');
  }
  
  console.log('✅ Bundle size validation passed\n');
  process.exit(0);
} catch (error) {
  console.error('❌ Error measuring bundle sizes:', error.message);
  process.exit(1);
}
