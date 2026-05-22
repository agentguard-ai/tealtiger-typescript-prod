/**
 * Payment provider secret detectors (~15 patterns)
 * Stripe, PayPal, Square, Braintree, Adyen, etc.
 */
import { SecretPattern } from '../types';

export const paymentDetectors: SecretPattern[] = [
  // Stripe (6 patterns)
  { id: 'stripe-secret-key', regex: /\bsk_live_[0-9a-zA-Z]{24,}\b/, category: 'payments', severity: 'CRITICAL', description: 'Stripe Secret Key (Live)' },
  { id: 'stripe-publishable-key', regex: /\bpk_live_[0-9a-zA-Z]{24,}\b/, category: 'payments', severity: 'CRITICAL', description: 'Stripe Publishable Key (Live)' },
  { id: 'stripe-test-secret', regex: /\bsk_test_[0-9a-zA-Z]{24,}\b/, category: 'payments', severity: 'LOW', description: 'Stripe Secret Key (Test)' },
  { id: 'stripe-test-publishable-key', regex: /\bpk_test_[0-9a-zA-Z]{24,}\b/, category: 'payments', severity: 'LOW', description: 'Stripe Publishable Key (Test)' },
  { id: 'stripe-restricted-key', regex: /\brk_live_[0-9a-zA-Z]{24,}\b/, category: 'payments', severity: 'CRITICAL', description: 'Stripe Restricted Key (Live)' },
  { id: 'stripe-webhook-secret', regex: /\bwhsec_[0-9a-zA-Z]{32,}\b/, category: 'payments', severity: 'HIGH', description: 'Stripe Webhook Secret' },

  // PayPal (3 patterns)
  { id: 'paypal-client-id', regex: /(?:PAYPAL_CLIENT_ID|paypal_client_id)\s*[:=]\s*["']?([A-Za-z0-9_-]{80})/, category: 'payments', severity: 'HIGH', description: 'PayPal Client ID' },
  { id: 'paypal-secret', regex: /(?:PAYPAL_SECRET|paypal_client_secret)\s*[:=]\s*["']?([A-Za-z0-9_-]{80})/, category: 'payments', severity: 'CRITICAL', description: 'PayPal Client Secret' },
  { id: 'paypal-access-token', regex: /\bA21AA[A-Za-z0-9_-]{60,}\b/, category: 'payments', severity: 'HIGH', description: 'PayPal Access Token' },

  // Square (3 patterns)
  { id: 'square-access-token', regex: /\bsq0atp-[A-Za-z0-9_-]{22}\b/, category: 'payments', severity: 'CRITICAL', description: 'Square Access Token' },
  { id: 'square-oauth-secret', regex: /\bsq0csp-[A-Za-z0-9_-]{43}\b/, category: 'payments', severity: 'CRITICAL', description: 'Square OAuth Secret' },
  { id: 'square-application-id', regex: /\bsq0idp-[A-Za-z0-9_-]{22}\b/, category: 'payments', severity: 'MEDIUM', description: 'Square Application ID' },

  // Braintree (2 patterns)
  { id: 'braintree-access-token', regex: /access_token\$production\$[a-z0-9]{16}\$[a-f0-9]{32}/, category: 'payments', severity: 'CRITICAL', description: 'Braintree Access Token' },
  { id: 'braintree-private-key', regex: /(?:BRAINTREE_PRIVATE_KEY|braintree_private_key)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'payments', severity: 'CRITICAL', description: 'Braintree Private Key' },

  // Adyen (1 pattern)
  { id: 'adyen-api-key', regex: /(?:ADYEN_API_KEY|adyen_api_key)\s*[:=]\s*["']?(AQE[a-z0-9]{5,}\.[A-Za-z0-9_-]{40,})/, category: 'payments', severity: 'CRITICAL', description: 'Adyen API Key' },

  // Plaid (1 pattern)
  { id: 'plaid-secret', regex: /(?:PLAID_SECRET|plaid_secret)\s*[:=]\s*["']?([a-f0-9]{30})/, category: 'payments', severity: 'CRITICAL', description: 'Plaid Secret' },
];
