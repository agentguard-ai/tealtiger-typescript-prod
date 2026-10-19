/**
 * Test verifying provider-specific entry points are decoupled from general client barrels (#556)
 */

import * as fs from "fs";
import * as path from "path";

describe("Provider Entry Points Decoupling (#556)", () => {
  const providersDir = path.resolve(__dirname, "..");

  const providerFiles = [
    "openai.ts",
    "anthropic.ts",
    "azure-openai.ts",
    "bedrock.ts",
    "cohere.ts",
    "gemini.ts",
    "mistral.ts",
    "ollama.ts"
  ];

  providerFiles.forEach(file => {
    it(`${file} should not import from the general client or clients barrels`, () => {
      const filePath = path.join(providersDir, file);
      const content = fs.readFileSync(filePath, "utf8");
      const lines = content.split("\n");

      const barrelImports = lines.filter(line => {
        const trimmed = line.trim();
        return (
          (trimmed.startsWith("export ") || trimmed.startsWith("import ")) &&
          (trimmed.includes("from '../client'") ||
           trimmed.includes("from \"../client\"") ||
           trimmed.includes("from '../clients'") ||
           trimmed.includes("from \"../clients\""))
        );
      });

      expect(barrelImports).toEqual([]);
    });
  });
});
