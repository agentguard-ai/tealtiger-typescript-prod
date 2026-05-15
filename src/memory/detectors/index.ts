/**
 * TealMemory v2 — Detectors
 *
 * Re-exports instruction injection and exfiltration detection modules
 * for TealMemory v2 memory governance enhancements.
 *
 * @module memory/detectors
 */

export {
  scoreInstructionLikeness,
  detectMemoryInstructionInjection,
  type InstructionLikenessResult,
  type InstructionInjectionDetectionResult,
} from './instruction-injection-detector';

export {
  detectMemoryExfiltration,
  type ExfiltrationDetectionResult,
} from './exfiltration-detector';
