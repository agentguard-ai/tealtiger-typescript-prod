/**
 * Property-Based Tests for TealTiger Rebrand Validation
 * Feature: agentguard-to-tealtiger-rebrand
 * 
 * These tests validate that the rebrand from AgentGuard to TealTiger
 * is complete and consistent across the codebase.
 */

import * as fs from 'fs';
import * as path from 'path';

describe('Rebrand Validation Tests', () => {
  const srcDir = path.join(__dirname, '..');
  
  /**
   * Property 1: Import Path Consistency
   * Validates: Requirements 2.1, 2.3, 2.4
   * 
   * For any source code file, all import statements SHALL use the new 
   * package name "tealtiger" instead of any variation of "agentguard"
   */
  describe('Property 1: Import Path Consistency', () => {
    const getAllFiles = (dir: string, fileList: string[] = []): string[] => {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          fileList.push(filePath);
        }
      });
      
      return fileList;
    };

    it('should not contain any imports from "agentguard-sdk"', () => {
      const files = getAllFiles(srcDir);
      const violations: { file: string; line: number; content: string }[] = [];
      
      files.forEach(file => {
        // Skip this test file itself
        if (file.includes('rebrand-validation.test.ts')) {
          return;
        }
        
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (
            line.includes('from \'agentguard-sdk\'') ||
            line.includes('from "agentguard-sdk"') ||
            line.includes('require(\'agentguard-sdk\')') ||
            line.includes('require("agentguard-sdk")') ||
            line.includes('from \'@agentguard/sdk\'') ||
            line.includes('from "@agentguard/sdk"')
          ) {
            violations.push({
              file: path.relative(srcDir, file),
              line: index + 1,
              content: line.trim()
            });
          }
        });
      });
      
      if (violations.length > 0) {
        const message = violations
          .map(v => `  ${v.file}:${v.line} - ${v.content}`)
          .join('\n');
        throw new Error(`Found old package imports:\n${message}`);
      }
      
      expect(violations).toHaveLength(0);
    });

    it('should use "tealtiger" in package imports where applicable', () => {
      // This test verifies that if there are any package imports,
      // they use the correct new package name
      const indexFile = path.join(srcDir, 'index.ts');
      
      if (fs.existsSync(indexFile)) {
        const content = fs.readFileSync(indexFile, 'utf-8');
        
        // Check that if there are any package references, they're correct
        const hasOldReferences = 
          content.includes('agentguard-sdk') ||
          content.includes('@agentguard/sdk');
        
        expect(hasOldReferences).toBe(false);
      }
    });
  });

  /**
   * Property 2: Class Naming Consistency
   * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5
   * 
   * For any class definition or reference, all client classes SHALL use 
   * the "Teal" prefix (TealOpenAI, TealAnthropic, TealAzureOpenAI)
   */
  describe('Property 2: Class Naming Consistency', () => {
    const getAllFiles = (dir: string, fileList: string[] = []): string[] => {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          fileList.push(filePath);
        }
      });
      
      return fileList;
    };

    it('should not contain any "Guarded" prefixed class names', () => {
      const files = getAllFiles(srcDir);
      const violations: { file: string; line: number; content: string }[] = [];
      
      const oldClassPatterns = [
        /class\s+GuardedOpenAI/,
        /class\s+GuardedAnthropic/,
        /class\s+GuardedAzureOpenAI/,
        /interface\s+GuardedOpenAIConfig/,
        /interface\s+GuardedAnthropicConfig/,
        /interface\s+GuardedAzureOpenAIConfig/,
        /new\s+GuardedOpenAI/,
        /new\s+GuardedAnthropic/,
        /new\s+GuardedAzureOpenAI/,
        /:\s*GuardedOpenAI/,
        /:\s*GuardedAnthropic/,
        /:\s*GuardedAzureOpenAI/
      ];
      
      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          oldClassPatterns.forEach(pattern => {
            if (pattern.test(line)) {
              violations.push({
                file: path.relative(srcDir, file),
                line: index + 1,
                content: line.trim()
              });
            }
          });
        });
      });
      
      if (violations.length > 0) {
        const message = violations
          .map(v => `  ${v.file}:${v.line} - ${v.content}`)
          .join('\n');
        throw new Error(`Found old "Guarded" class names:\n${message}`);
      }
      
      expect(violations).toHaveLength(0);
    });

    it('should use "Teal" prefixed class names', () => {
      const clientsDir = path.join(srcDir, 'clients');
      
      if (fs.existsSync(clientsDir)) {
        const files = fs.readdirSync(clientsDir)
          .filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts'));
        
        const expectedClasses = ['TealOpenAI', 'TealAnthropic', 'TealAzureOpenAI'];
        const foundClasses: string[] = [];
        
        files.forEach(file => {
          const content = fs.readFileSync(path.join(clientsDir, file), 'utf-8');
          expectedClasses.forEach(className => {
            if (content.includes(`class ${className}`)) {
              foundClasses.push(className);
            }
          });
        });
        
        // At least some of the expected classes should be found
        expect(foundClasses.length).toBeGreaterThan(0);
      }
    });
  });

  /**
   * Property 3: Documentation Text Correctness
   * Validates: Requirements 5.1, 5.2, 5.3
   * 
   * For any documentation (comments, docstrings), all product references 
   * SHALL use "TealTiger" instead of "AgentGuard"
   */
  describe('Property 3: Documentation Text Correctness', () => {
    const getAllFiles = (dir: string, fileList: string[] = []): string[] => {
      const files = fs.readdirSync(dir);
      
      files.forEach(file => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory() && !file.startsWith('.') && file !== 'node_modules') {
          getAllFiles(filePath, fileList);
        } else if (file.endsWith('.ts') && !file.endsWith('.d.ts')) {
          fileList.push(filePath);
        }
      });
      
      return fileList;
    };

    it('should not contain "AgentGuard" in comments or docstrings', () => {
      const files = getAllFiles(srcDir);
      const violations: { file: string; line: number; content: string }[] = [];
      
      files.forEach(file => {
        const content = fs.readFileSync(file, 'utf-8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          // Check comments and docstrings for old brand name
          if (
            (line.includes('//') || line.includes('/*') || line.includes('*')) &&
            (line.includes('AgentGuard') || 
             line.includes('agentguard') ||
             line.includes('AGENTGUARD') ||
             line.includes('agent-guard') ||
             line.includes('Agent Guard'))
          ) {
            // Skip this test file itself
            if (!file.includes('rebrand-validation.test.ts')) {
              violations.push({
                file: path.relative(srcDir, file),
                line: index + 1,
                content: line.trim()
              });
            }
          }
        });
      });
      
      if (violations.length > 0) {
        const message = violations
          .map(v => `  ${v.file}:${v.line} - ${v.content}`)
          .join('\n');
        throw new Error(`Found "AgentGuard" references in documentation:\n${message}`);
      }
      
      expect(violations).toHaveLength(0);
    });
  });
});
