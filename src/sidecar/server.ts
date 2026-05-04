/**
 * TealTiger Governance Sidecar — HTTP Server
 *
 * Exposes TealEngine v1.2 as a language-agnostic HTTP API.
 * Any agent (Go, Rust, Java, Python, etc.) can call this sidecar
 * over HTTP to get governance decisions without importing the SDK.
 *
 * Endpoints:
 *   POST /evaluate   — Policy evaluation (returns Decision)
 *   POST /validate   — TEEC validation
 *   POST /scan       — Secret detection
 *   GET  /health     — Health check
 *   GET  /modules    — List active governance modules
 *   GET  /ready      — Readiness probe
 *
 * @module sidecar/server
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { TealEngineV12, type TealEngineV12Options } from '../core/engine/v1.2/TealEngineV12';
import { PolicyMode } from '../core/engine/types';
import { v4 as uuidv4 } from 'uuid';

// ── Config from environment ──────────────────────────────────────

const PORT = parseInt(process.env.TEALTIGER_PORT ?? '8080', 10);
const HOST = process.env.TEALTIGER_HOST ?? '0.0.0.0';
const POLICY_DIR = process.env.TEALTIGER_POLICY_DIR ?? '/etc/tealtiger/policies';
const POLICY_MODE = (process.env.TEALTIGER_MODE ?? 'ENFORCE') as keyof typeof PolicyMode;
const LOG_LEVEL = process.env.TEALTIGER_LOG_LEVEL ?? 'info';
const MAX_BODY_SIZE = parseInt(process.env.TEALTIGER_MAX_BODY_BYTES ?? '1048576', 10); // 1MB default

// ── Logger ───────────────────────────────────────────────────────

function log(level: 'info' | 'warn' | 'error' | 'debug', msg: string, meta?: object) {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(meta ?? {}),
  };
  const out = level === 'error' ? process.stderr : process.stdout;
  out.write(JSON.stringify(entry) + '\n');
}

// ── Policy loader ────────────────────────────────────────────────

function loadPolicies(): Record<string, unknown> {
  const policy: Record<string, unknown> = {};

  if (!fs.existsSync(POLICY_DIR)) {
    log('info', 'Policy directory not found, using empty policy', { dir: POLICY_DIR });
    return policy;
  }

  const files = fs.readdirSync(POLICY_DIR).filter(f => f.endsWith('.json'));
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(POLICY_DIR, file), 'utf-8');
      const parsed = JSON.parse(content);
      Object.assign(policy, parsed);
      log('info', 'Loaded policy file', { file });
    } catch (err) {
      log('warn', 'Failed to load policy file', { file, error: String(err) });
    }
  }

  return policy;
}

// ── Engine initialization ────────────────────────────────────────

const policy = loadPolicies();
const engineOptions: TealEngineV12Options = {
  policy,
  mode: PolicyMode[POLICY_MODE] ?? PolicyMode.ENFORCE,
  failurePolicy: { default: 'FAIL_CLOSED' },
};

const engine = new TealEngineV12(engineOptions);
log('info', 'TealEngine v1.2 initialized', {
  mode: POLICY_MODE,
  policyKeys: Object.keys(policy),
});

// ── Request body reader ──────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error(`Request body exceeds ${MAX_BODY_SIZE} bytes`));
        req.destroy();
        return;
      }
      body += chunk.toString();
    });

    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

// ── Response helpers ─────────────────────────────────────────────

function sendJSON(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'X-TealTiger-Version': '1.2.0',
  });
  res.end(json);
}

function sendError(res: http.ServerResponse, status: number, message: string, details?: unknown) {
  sendJSON(res, status, { error: message, ...(details ? { details } : {}) });
}

// ── Route handlers ───────────────────────────────────────────────

async function handleEvaluate(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    return sendError(res, 413, 'Request body too large');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const correlation_id = (payload.correlation_id as string) ?? uuidv4();
  const request = (payload.request as Record<string, unknown>) ?? payload;

  try {
    const ctx: Record<string, unknown> = { correlation_id };
    if (payload.agent_id) ctx.agent_id = payload.agent_id as string;
    if (payload.user_id) ctx.user_id = payload.user_id as string;
    if (payload.session_id) ctx.session_id = payload.session_id as string;
    if (payload.tenant_id) ctx.tenant_id = payload.tenant_id as string;

    const decision = await engine.evaluateV12(request, ctx as any);

    log('debug', 'Evaluation complete', {
      correlation_id,
      action: decision.action,
      risk_score: decision.risk_score,
    });

    sendJSON(res, 200, { correlation_id, decision });
  } catch (err) {
    log('error', 'Evaluation failed', { correlation_id, error: String(err) });
    sendError(res, 500, 'Evaluation failed', String(err));
  }
}

async function handleValidate(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    return sendError(res, 413, 'Request body too large');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  try {
    const validator = engine.getTEECValidator();
    const decision = payload.decision as Parameters<typeof validator.validateDecision>[0];
    if (!decision) {
      return sendError(res, 400, 'Missing "decision" field in request body');
    }
    const results = validator.validateDecision(decision);
    const valid = results.every(r => r.valid);
    sendJSON(res, 200, { valid, results });
  } catch (err) {
    sendError(res, 500, 'Validation failed', String(err));
  }
}

async function handleScan(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: string;
  try {
    body = await readBody(req);
  } catch {
    return sendError(res, 413, 'Request body too large');
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(body);
  } catch {
    return sendError(res, 400, 'Invalid JSON body');
  }

  const correlation_id = (payload.correlation_id as string) ?? uuidv4();
  const content = payload.content as string;

  if (!content) {
    return sendError(res, 400, 'Missing "content" field in request body');
  }

  try {
    // Route through TealEngine with a secrets-focused request
    const decision = await engine.evaluateV12(
      { content, scan_type: 'secrets' },
      { correlation_id },
    );

    sendJSON(res, 200, {
      correlation_id,
      findings: decision.findings ?? [],
      action: decision.action,
      risk_score: decision.risk_score,
    });
  } catch (err) {
    log('error', 'Scan failed', { correlation_id, error: String(err) });
    sendError(res, 500, 'Scan failed', String(err));
  }
}

function handleHealth(_req: http.IncomingMessage, res: http.ServerResponse) {
  sendJSON(res, 200, {
    status: 'ok',
    version: '1.2.0',
    mode: POLICY_MODE,
    uptime_seconds: Math.floor(process.uptime()),
  });
}

function handleReady(_req: http.IncomingMessage, res: http.ServerResponse) {
  // Readiness: engine must be initialized
  sendJSON(res, 200, { ready: true });
}

function handleModules(_req: http.IncomingMessage, res: http.ServerResponse) {
  const status = engine.getModuleStatus();
  sendJSON(res, 200, { modules: status });
}

// ── Router ───────────────────────────────────────────────────────

async function router(req: http.IncomingMessage, res: http.ServerResponse) {
  const method = req.method?.toUpperCase();
  const url = req.url?.split('?')[0];

  log('debug', 'Request', { method, url });

  // CORS headers for browser-based tools
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (method === 'POST' && url === '/evaluate') return await handleEvaluate(req, res);
    if (method === 'POST' && url === '/validate') return await handleValidate(req, res);
    if (method === 'POST' && url === '/scan') return await handleScan(req, res);
    if (method === 'GET' && url === '/health') return handleHealth(req, res);
    if (method === 'GET' && url === '/ready') return handleReady(req, res);
    if (method === 'GET' && url === '/modules') return handleModules(req, res);

    sendError(res, 404, `Route not found: ${method} ${url}`);
  } catch (err) {
    log('error', 'Unhandled error in router', { error: String(err) });
    sendError(res, 500, 'Internal server error');
  }
}

// ── Server startup ───────────────────────────────────────────────

const server = http.createServer(router);

server.listen(PORT, HOST, () => {
  log('info', 'TealTiger governance sidecar started', {
    host: HOST,
    port: PORT,
    mode: POLICY_MODE,
    policy_dir: POLICY_DIR,
    endpoints: [
      'POST /evaluate',
      'POST /validate',
      'POST /scan',
      'GET  /health',
      'GET  /ready',
      'GET  /modules',
    ],
  });
});

// ── Graceful shutdown ────────────────────────────────────────────

function shutdown(signal: string) {
  log('info', `Received ${signal}, shutting down gracefully`);
  server.close(() => {
    log('info', 'Server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    log('warn', 'Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  log('error', 'Uncaught exception', { error: String(err), stack: err.stack });
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  log('error', 'Unhandled rejection', { reason: String(reason) });
  process.exit(1);
});
