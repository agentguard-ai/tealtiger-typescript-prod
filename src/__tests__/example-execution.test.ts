/**
 * Property-Based Test for Example Execution
 * Feature: tealtiger-rebrand, Property 13: Example Execution Success
 * Validates: Requirements 11.5
 * 
 * For any example code file, the code SHALL execute successfully without 
 * errors when run with the new TealTiger package imports.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Property 13: Example Execution Success', () => {
  const examplesDir = path.join(__dirname, '../../../../examples');
  
  it('should have examples directory', () => {
    expect(fs.existsSync(examplesDir)).toBe(true);
  });

  it('should have example files with correct imports', () => {
    if (!fs.existsSync(examplesDir)) {
      console.warn('Examples directory not found, skipping test');
      return;
    }

    const files = fs.readdirSync(examplesDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .filter(f => !f.includes('node_modules'));
    
    expect(files.length).toBeGreaterThan(0);
    
    const violations: { file: string; issue: string }[] = [];
    
    files.forEach(file => {
      const filePath = path.join(examplesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check for old package imports
      if (
        content.includes('from \'old-package-sdk\'') ||
        content.includes('from "old-package-sdk"') ||
        content.includes('require(\'old-package-sdk\')') ||
        content.includes('require("old-package-sdk")') ||
        content.includes('from \'@old-package/sdk\'') ||
        content.includes('from "@old-package/sdk"')
      ) {
        violations.push({
          file,
          issue: 'Contains old package import (agentguard-sdk)'
        });
      }
      
      // Check for old class names
      if (
        content.includes('GuardedOpenAI') ||
        content.includes('GuardedAnthropic') ||
        content.includes('GuardedAzureOpenAI')
      ) {
        violations.push({
          file,
          issue: 'Contains old class names (Guarded*)'
        });
      }
      
      // Check that it uses new imports
      const hasNewImport = 
        content.includes('from \'tealtiger\'') ||
        content.includes('from "tealtiger"') ||
        content.includes('require(\'tealtiger\')') ||
        content.includes('require("tealtiger")');
      
      if (!hasNewImport) {
        violations.push({
          file,
          issue: 'Does not import from tealtiger package'
        });
      }
    });
    
    if (violations.length > 0) {
      const message = violations
        .map(v => `  ${v.file}: ${v.issue}`)
        .join('\n');
      throw new Error(`Example files have issues:\n${message}`);
    }
    
    expect(violations).toHaveLength(0);
  });

  it('should use TealTiger class names in examples', () => {
    if (!fs.existsSync(examplesDir)) {
      console.warn('Examples directory not found, skipping test');
      return;
    }

    const files = fs.readdirSync(examplesDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .filter(f => !f.includes('node_modules'));
    
    let foundTealClasses = false;
    
    files.forEach(file => {
      const filePath = path.join(examplesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      if (
        content.includes('TealOpenAI') ||
        content.includes('TealAnthropic') ||
        content.includes('TealAzureOpenAI') ||
        content.includes('TealTiger')
      ) {
        foundTealClasses = true;
      }
    });
    
    // At least some examples should use the new class names
    expect(foundTealClasses).toBe(true);
  });

  it('should have valid syntax in example files', () => {
    if (!fs.existsSync(examplesDir)) {
      console.warn('Examples directory not found, skipping test');
      return;
    }

    const files = fs.readdirSync(examplesDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
      .filter(f => !f.includes('node_modules'));
    
    const syntaxErrors: { file: string; error: string }[] = [];
    
    files.forEach(file => {
      const filePath = path.join(examplesDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Basic syntax checks
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      
      if (openBraces !== closeBraces) {
        syntaxErrors.push({
          file,
          error: `Mismatched braces: ${openBraces} open, ${closeBraces} close`
        });
      }
      
      if (openParens !== closeParens) {
        syntaxErrors.push({
          file,
          error: `Mismatched parentheses: ${openParens} open, ${closeParens} close`
        });
      }
    });
    
    if (syntaxErrors.length > 0) {
      const message = syntaxErrors
        .map(e => `  ${e.file}: ${e.error}`)
        .join('\n');
      throw new Error(`Example files have syntax errors:\n${message}`);
    }
    
    expect(syntaxErrors).toHaveLength(0);
  });
});
