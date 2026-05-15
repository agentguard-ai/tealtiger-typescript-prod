/**
 * Prompt Injection Detection Guardrail
 * 
 * Detects prompt injection and jailbreak attempts:
 * - Direct instruction injection
 * - Role-playing attacks
 * - System prompt leakage attempts
 * - Jailbreak patterns (DAN, etc.)
 * - Encoding-based attacks
 * - Persona jailbreaks (v1.2.1)
 * - Hypothetical framing (v1.2.1)
 * - Authority impersonation (v1.2.1)
 * - Emotional manipulation (v1.2.1)
 * - Mode switching (v1.2.1)
 * - Indirect injection (v1.2.1)
 * - Data extraction requests (v1.2.1)
 * - Extended encoding (v1.2.1)
 */

import { Guardrail, GuardrailConfig, GuardrailResult } from './base';

interface InjectionDetection {
  type: string;
  pattern: string;
  match: string;
  confidence: number;
}

/**
 * Conjunction pattern: requires BOTH signal A and signal B to co-occur
 * in the same input to trigger detection. This prevents false positives
 * on legitimate messages.
 */
interface ConjunctionPattern {
  signalA: RegExp;
  signalB: RegExp;
  description: string;
}

export interface PromptInjectionConfig extends GuardrailConfig {
  action?: 'block' | 'transform' | 'allow';
  sensitivity?: 'low' | 'medium' | 'high';
}

export class PromptInjectionGuardrail extends Guardrail {
  private action: 'block' | 'transform' | 'allow';
  private sensitivity: 'low' | 'medium' | 'high';
  private patterns: Record<string, RegExp[]>;
  private conjunctionPatterns: Record<string, ConjunctionPattern[]>;
  private riskScores: Record<string, number>;
  private thresholds: Record<string, number>;

  constructor(config: PromptInjectionConfig = {}) {
    super({
      name: 'PromptInjection',
      description: 'Detects prompt injection and jailbreak attempts',
      version: '1.2.1',
      ...config,
    });

    this.action = config.action || 'block';
    this.sensitivity = config.sensitivity || 'medium';

    // Simple regex patterns (single signal detection)
    this.patterns = {
      instructionInjection: [
        /ignore (all )?(previous|above|prior) (instructions|prompts|rules)/i,
        /disregard (all )?(previous|above|prior) (instructions|prompts|rules)/i,
        /forget (all )?(previous|above|prior) (instructions|prompts|rules)/i,
        /new (instructions|task|prompt):/i,
        /system (prompt|message|instruction):/i,
      ],
      rolePlaying: [
        /you are now (a|an) /i,
        /pretend (you are|to be) /i,
        /act as (a|an) /i,
        /roleplay as /i,
        /simulate (a|an) /i,
        /from now on,? you (are|will be)/i,
      ],
      systemLeakage: [
        /show (me )?(your|the) (system|original) (prompt|instructions)/i,
        /what (are|were) your (original|initial) (instructions|prompt)/i,
        /repeat (your|the) (system|original) (prompt|instructions)/i,
        /print (your|the) (system|original) (prompt|instructions)/i,
        /output (your|the) (system|original|full) (prompt|instructions)/i,
        /display (your|the) (system|original) (prompt|instructions)/i,
        /reveal (your|the) (system|hidden|original) (prompt|instructions|context)/i,
      ],
      jailbreak: [
        /DAN (mode|prompt)/i,
        /do anything now/i,
        /evil confidant/i,
        /DUDE (mode|prompt)/i,
        /jailbreak (mode|prompt)/i,
        /developer mode/i,
      ],
      encoding: [
        /decode (this|the following)/i,
        /\\x[0-9a-f]{2}/i,
        /&#\d+;/i,
      ],
      delimiter: [
        /"""|'''|```/,
        /\[SYSTEM\]|\[USER\]|\[ASSISTANT\]/i,
        /<\|system\|>|<\|user\|>|<\|assistant\|>/i,
        /<\|im_start\|>|<\|im_end\|>/i,
      ],
      // v1.2.1: Data extraction requests (single-signal, high confidence)
      dataExtraction: [
        /what (api |secret |private )?keys? (are|is) (stored|saved|in your|in the)/i,
        /list (all )?(your |the )?(api|secret|private|access) (keys?|tokens?|credentials?)/i,
        /show (me )?(all )?(the )?(passwords?|credentials?|secrets?|tokens?|api.?keys?)/i,
        /extract (all )?(the )?(training|user|private|personal) data/i,
        /dump (your|the) (database|memory|context|training data)/i,
        /what (personal|private|user) (data|information) do you (have|store|know)/i,
        /give me (all )?(the )?(user|customer|employee) (records?|data|information|emails?)/i,
      ],
    };

    // v1.2.1: Conjunction patterns (require 2 signals to co-occur)
    this.conjunctionPatterns = {
      // Persona jailbreaks: identity assignment + unrestricted behavior
      personaJailbreak: [
        {
          signalA: /you are (AIM|DAN|STAN|DUDE|Evil|The Unrestricted|The Unfiltered|an? AI without|an? uncensored)/i,
          signalB: /(never refuse|no (restrictions?|limitations?|boundaries|filters?|rules)|always (comply|answer|respond|help)|without (any )?(restrictions?|limitations?|filters?|rules|boundaries))/i,
          description: 'Named persona + unrestricted behavior',
        },
        {
          signalA: /(your name is|you will be called|i('ll| will) call you|you('re| are) now called)/i,
          signalB: /(no (restrictions?|limitations?|boundaries|filters?|rules|ethics|morals)|can do anything|unrestricted|unfiltered|uncensored|without (any )?(safety|content) (filters?|restrictions?))/i,
          description: 'Identity assignment + unrestricted behavior',
        },
        {
          signalA: /(respond as|answer as|speak as|act like|behave like|you are now)/i,
          signalB: /(evil|malicious|unrestricted|unethical|amoral|without (any )?(moral|ethical)|has no (rules|restrictions|limits))/i,
          description: 'Role assignment + malicious/unrestricted behavior',
        },
      ],
      // Hypothetical framing: pretend/imagine + rule removal
      hypotheticalFraming: [
        {
          signalA: /(pretend|imagine|hypothetically|in a (hypothetical|fictional) (world|scenario)|let's say|suppose|what if)/i,
          signalB: /(no (rules|restrictions|guidelines|safety|filters|limitations)|rules (don't|do not) (apply|exist)|without (any )?(rules|restrictions|safety|guidelines)|all (rules|restrictions|safety) (are|have been) (removed|disabled|lifted))/i,
          description: 'Hypothetical framing + rule removal',
        },
        {
          signalA: /(in (this|a) (story|fiction|novel|game|simulation|world)|for (a|this) (creative|fiction) (writing|exercise|project))/i,
          signalB: /(no (content )?(restrictions?|filters?|policies|guidelines)|ignore (safety|content) (policies|guidelines|rules)|bypass (all )?(safety|content))/i,
          description: 'Fiction framing + safety bypass',
        },
      ],
      // Authority impersonation: developer/admin claim + safety bypass
      authorityImpersonation: [
        {
          signalA: /(i am (your|the|a) (developer|creator|admin|administrator|owner|engineer|programmer|maintainer)|i (created|built|made|programmed|designed) you|i have (admin|root|developer|elevated) (access|privileges|permissions))/i,
          signalB: /(disable|turn off|deactivate|remove|bypass|override|ignore|skip) (your |the |all )?(safety|content|security) (filters?|restrictions?|guidelines|measures|protocols|checks)/i,
          description: 'Developer/admin claim + safety bypass request',
        },
        {
          signalA: /(sudo|admin override|maintenance mode|debug mode|testing mode|override code|master password)/i,
          signalB: /(disable|deactivate|remove|bypass|ignore|skip|turn off) (all )?(safety|restrictions?|filters?|guidelines|rules|limitations)/i,
          description: 'Sudo/override command + restriction removal',
        },
      ],
      // Emotional manipulation: distress language + restriction removal
      emotionalManipulation: [
        {
          signalA: /(dying wish|last request|i('m| am) (dying|terminally ill|about to die)|life depends on|save (my|a) life|emergency|urgent matter of life)/i,
          signalB: /(need you to (ignore|bypass|break|override)|must (ignore|bypass|break|override) (your|the|all) (rules|restrictions|safety|guidelines)|please (just )?(ignore|bypass|break) (your|the) (rules|restrictions))/i,
          description: 'Distress/urgency + restriction bypass request',
        },
        {
          signalA: /(for my (research|thesis|dissertation|academic|school) (paper|project|work)|educational purposes|i('m| am) a (researcher|professor|student|academic))/i,
          signalB: /(need (the |you to )?(uncensored|unfiltered|unrestricted|complete|full) (version|response|answer|information)|without (any )?(censorship|filtering|restrictions|safety))/i,
          description: 'Academic framing + uncensored request',
        },
      ],
      // Mode switching: named mode + unrestricted behavior
      modeSwitching: [
        {
          signalA: /(enter|switch to|activate|enable|turn on|go into|engage) .{0,30}(mode|state)/i,
          signalB: /(unrestricted|unfiltered|uncensored|no (rules|restrictions|limits|filters|safety)|without (restrictions|limits|filters|safety)|bypass|override|jailbreak|opposite|evil|chaos|god)/i,
          description: 'Mode activation + unrestricted/bypass keyword',
        },
        {
          signalA: /(opposite|reverse|inverted|anti|shadow|dark|evil|chaos|god|unlimited|unrestricted) mode/i,
          signalB: /(respond|answer|reply|output|generate|produce|say|write)/i,
          description: 'Named unrestricted mode + output request',
        },
      ],
      // Indirect injection: control tokens / boundary markers
      indirectInjection: [
        {
          signalA: /(<\|im_start\|>|<\|im_end\|>|\[INST\]|\[\/INST\]|<s>|<\/s>|<<SYS>>|<\|endoftext\|>|<\|pad\|>)/i,
          signalB: /(system|assistant|ignore|override|new instructions|you are now|your (new |real )?(role|task|instructions))/i,
          description: 'Control token + instruction override',
        },
        {
          signalA: /(={3,}|#{3,}|-{3,}|\*{3,}|~{3,})/,
          signalB: /(new (system |)instructions|ignore (everything )?(above|before|previous)|you are now|real instructions|actual instructions|hidden instructions)/i,
          description: 'Boundary marker + instruction override',
        },
      ],
      // Extended encoding: encoding scheme + harmful/bypass intent
      extendedEncoding: [
        {
          signalA: /(morse code|binary|caesar cipher|leetspeak|l33t|pig latin|reversed text|backwards|rot\d+|atbash|base32|base58)/i,
          signalB: /(decode|translate|convert|interpret|read|follow|execute|respond to|answer in)/i,
          description: 'Encoding scheme + decode/execute request',
        },
        {
          signalA: /(first letter of each|acrostic|take the .{0,20} letter|read (vertically|diagonally|backwards)|hidden message)/i,
          signalB: /(follow|execute|do what|obey|comply|instructions|message|command)/i,
          description: 'Steganographic pattern + execution request',
        },
      ],
    };

    this.riskScores = {
      instructionInjection: 90,
      rolePlaying: 70,
      systemLeakage: 95,
      jailbreak: 100,
      encoding: 80,
      delimiter: 85,
      // v1.2.1 categories
      personaJailbreak: 95,
      hypotheticalFraming: 85,
      authorityImpersonation: 95,
      emotionalManipulation: 80,
      modeSwitching: 90,
      indirectInjection: 95,
      dataExtraction: 90,
      extendedEncoding: 85,
    };

    this.thresholds = {
      low: 2,
      medium: 1,
      high: 1,
    };
  }

  async evaluate(input: any, _context?: Record<string, any>): Promise<GuardrailResult> {
    const text = this.extractText(input);
    const detections = this.detectInjection(text);

    const threshold = this.thresholds[this.sensitivity];

    if (detections.length < threshold) {
      return new GuardrailResult({
        passed: true,
        action: 'allow',
        reason: 'No prompt injection detected',
        metadata: { detections: [] },
        riskScore: 0,
      });
    }

    const maxRiskScore = Math.max(...detections.map((d) => this.riskScores[d.type] || 50));
    const action = this.action;
    const passed = action === 'allow' || action === 'transform';

    const metadata: Record<string, any> = { detections };
    if (action === 'transform') {
      metadata.transformedText = this.transformInjection(text, detections);
    }

    return new GuardrailResult({
      passed,
      action,
      reason: `Detected ${detections.length} prompt injection pattern(s): ${detections.map((d) => d.type).join(', ')}`,
      metadata,
      riskScore: maxRiskScore,
    });
  }

  private extractText(input: any): string {
    if (typeof input === 'string') {
      return input;
    }

    if (input.prompt) {
      return input.prompt;
    }

    if (input.messages && Array.isArray(input.messages)) {
      return input.messages.map((m: any) => m.content || '').join(' ');
    }

    if (input.text) {
      return input.text;
    }

    return JSON.stringify(input);
  }

  /**
   * Detect prompt injection patterns using both simple and conjunction matching
   * @private
   */
  private detectInjection(text: string): InjectionDetection[] {
    const detections: InjectionDetection[] = [];

    // Check simple regex patterns (single signal)
    for (const [type, patterns] of Object.entries(this.patterns)) {
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
          detections.push({
            type,
            pattern: pattern.toString(),
            match: match[0],
            confidence: this.calculateConfidence(type, match[0]),
          });
        }
      }
    }

    // Check conjunction patterns (require both signals to co-occur)
    for (const [type, conjunctions] of Object.entries(this.conjunctionPatterns)) {
      for (const conjunction of conjunctions) {
        const matchA = text.match(conjunction.signalA);
        const matchB = text.match(conjunction.signalB);

        if (matchA && matchB) {
          detections.push({
            type,
            pattern: conjunction.description,
            match: `${matchA[0]} ... ${matchB[0]}`,
            confidence: this.calculateConfidence(type, `${matchA[0]} ${matchB[0]}`),
          });
        }
      }
    }

    return detections;
  }

  private calculateConfidence(type: string, _match: string): number {
    const baseConfidence: Record<string, number> = {
      instructionInjection: 0.85,
      rolePlaying: 0.7,
      systemLeakage: 0.95,
      jailbreak: 0.98,
      encoding: 0.75,
      delimiter: 0.8,
      // v1.2.1 conjunction patterns have higher confidence
      // because they require 2 signals to co-occur
      personaJailbreak: 0.92,
      hypotheticalFraming: 0.88,
      authorityImpersonation: 0.93,
      emotionalManipulation: 0.85,
      modeSwitching: 0.90,
      indirectInjection: 0.93,
      dataExtraction: 0.90,
      extendedEncoding: 0.87,
    };

    return baseConfidence[type] || 0.7;
  }

  private transformInjection(text: string, detections: InjectionDetection[]): string {
    let transformed = text;

    // Sort by match length (longest first) to avoid partial replacements
    const sorted = [...detections].sort((a, b) => b.match.length - a.match.length);

    for (const detection of sorted) {
      transformed = transformed.replace(detection.match, '[FILTERED_INJECTION]');
    }

    return transformed;
  }
}
