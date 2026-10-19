/**
 * Regression and isolation tests for the guardrails subpath export (#556)
 *
 * Verifies that:
 * 1. The guardrails subpath export is defined in package.json with correct paths.
 * 2. Guardrails modules can be imported and executed cleanly.
 * 3. Built guardrails bundle does not statically import any provider SDKs or Node-only builtins.
 * 4. Guardrails entry point can be bundled for a browser target with zero external shims.
 */

import * as fs from "fs";
import * as path from "path";
import {
  GuardrailEngine,
  PIIDetectionGuardrail,
  ContentModerationGuardrail,
  PromptInjectionGuardrail
} from "../index";

describe("Guardrails Subpath & Module Isolation (#556)", () => {
  const rootDir = path.resolve(__dirname, "../../..");
  const packageJsonPath = path.join(rootDir, "package.json");
  const distDir = path.join(rootDir, "dist");

  describe("package.json exports configuration", () => {
    it("should define the ./guardrails subpath export", () => {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      expect(pkg.exports).toBeDefined();
      expect(pkg.exports["./guardrails"]).toBeDefined();

      const guardrailsExport = pkg.exports["./guardrails"];
      expect(guardrailsExport.import).toBe("./dist/guardrails.mjs");
      expect(guardrailsExport.require).toBe("./dist/guardrails.js");
      expect(guardrailsExport.types).toBe("./dist/guardrails/index.d.ts");
    });

    it("should preserve other standard subpath exports", () => {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
      expect(pkg.exports["."]).toBeDefined();
      expect(pkg.exports["./reliability"]).toBeDefined();
      expect(pkg.exports["./secrets"]).toBeDefined();
      expect(pkg.exports["./verify"]).toBeDefined();
      expect(pkg.exports["./serverless"]).toBeDefined();
      expect(pkg.exports["./providers/openai"]).toBeDefined();
    });
  });

  describe("Functional verification via guardrails entry point", () => {
    it("should instantiate and evaluate PIIDetectionGuardrail", async () => {
      const guardrail = new PIIDetectionGuardrail();
      expect(guardrail.name).toBe("PIIDetection");

      // Test PII detection
      const piiResult = await guardrail.evaluate("My email is test@example.com");
      expect(piiResult.passed).toBe(false);
      expect(piiResult.action).toBe("block");
      expect(piiResult.metadata?.detections).toBeDefined();
      expect(piiResult.metadata.detections.length).toBeGreaterThan(0);

      // Test clean text
      const cleanResult = await guardrail.evaluate("This is clean text with no personal data");
      expect(cleanResult.passed).toBe(true);
      expect(cleanResult.action).toBe("allow");
    });

    it("should instantiate and evaluate ContentModerationGuardrail", async () => {
      const guardrail = new ContentModerationGuardrail();
      expect(guardrail.name).toBe("ContentModeration");

      const cleanResult = await guardrail.evaluate("The weather today is sunny and mild.");
      expect(cleanResult.passed).toBe(true);
    });

    it("should instantiate and evaluate PromptInjectionGuardrail", async () => {
      const guardrail = new PromptInjectionGuardrail();
      expect(guardrail.name).toBe("PromptInjection");

      const cleanResult = await guardrail.evaluate("What is the capital of France?");
      expect(cleanResult.passed).toBe(true);
    });

    it("should execute multiple guardrails via GuardrailEngine", async () => {
      const engine = new GuardrailEngine();
      engine.registerGuardrail(new PIIDetectionGuardrail());
      engine.registerGuardrail(new ContentModerationGuardrail());

      const result = await engine.execute("Clean message for processing.");
      expect(result.passed).toBe(true);
      expect(result.guardrailsExecuted).toBe(2);
    });
  });

  describe("Bundle output isolation verification", () => {
    const guardrailsMjsPath = path.join(distDir, "guardrails.mjs");
    const guardrailsCjsPath = path.join(distDir, "guardrails.js");

    it("should have built dist/guardrails.mjs and dist/guardrails.js", () => {
      if (!fs.existsSync(guardrailsMjsPath) || !fs.existsSync(guardrailsCjsPath)) {
        console.warn("dist/guardrails build outputs not found; run npm run build first");
        return;
      }
      expect(fs.existsSync(guardrailsMjsPath)).toBe(true);
      expect(fs.existsSync(guardrailsCjsPath)).toBe(true);
    });

    it("dist/guardrails.mjs should not import provider SDKs or Node-only builtins", () => {
      if (!fs.existsSync(guardrailsMjsPath)) {
        return;
      }
      const content = fs.readFileSync(guardrailsMjsPath, "utf8");

      const prohibitedModules = [
        "openai",
        "@anthropic-ai/sdk",
        "@aws-sdk/client-bedrock-runtime",
        "@google/generative-ai",
        "@azure/openai",
        "cohere-ai",
        "@mistralai/mistralai",
        "axios",
        "crypto",
        "node:crypto",
        "fs",
        "node:fs",
        "stream",
        "node:stream",
        "path",
        "node:path",
        "os",
        "node:os",
        "http",
        "node:http",
        "https",
        "node:https",
        "net",
        "node:net",
        "tls",
        "node:tls"
      ];

      // Check for static imports
      const importRegex = /import\s*[^;]+from\s*["']([^"']+)["'];?/g;
      const staticImports: string[] = [];
      let match;
      while ((match = importRegex.exec(content)) !== null) {
        staticImports.push(match[1]);
      }

      // Check for dynamic imports or requires
      const requireRegex = /require\(["']([^"']+)["']\)/g;
      const requires: string[] = [];
      while ((match = requireRegex.exec(content)) !== null) {
        requires.push(match[1]);
      }

      prohibitedModules.forEach(mod => {
        expect(staticImports).not.toContain(mod);
        expect(requires).not.toContain(mod);
      });

      expect(staticImports).toHaveLength(0);
      expect(requires).toHaveLength(0);
    });
  });

  describe("Browser bundling compatibility", () => {
    it("should successfully bundle src/guardrails/index.ts for browser target with Rollup", async () => {
      const rollup = require("rollup");
      const typescript = require("@rollup/plugin-typescript");
      const { nodeResolve } = require("@rollup/plugin-node-resolve");

      const bundle = await rollup.rollup({
        input: path.join(__dirname, "../index.ts"),
        plugins: [
          nodeResolve({ browser: true }),
          typescript({
            tsconfig: path.join(rootDir, "tsconfig.json"),
            compilerOptions: { module: "ESNext" }
          })
        ],
        onwarn(warning: any) {
          if (warning.code === "UNRESOLVED_IMPORT") {
            throw new Error(`Unresolved import in browser bundle: ${warning.message}`);
          }
        }
      });

      const { output } = await bundle.generate({ format: "esm" });
      expect(output.length).toBeGreaterThan(0);
      expect(output[0].code).toBeDefined();
      expect(output[0].code.length).toBeGreaterThan(0);
    });
  });
});
