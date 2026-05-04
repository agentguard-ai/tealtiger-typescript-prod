/**
 * SaaS provider secret detectors (~50 patterns)
 * Salesforce, Zendesk, Jira, Slack, Twilio, SendGrid, etc.
 */
import { SecretPattern } from '../types';

export const saasDetectors: SecretPattern[] = [
  // Slack (5 patterns)
  { id: 'slack-bot-token', regex: /\bxoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}\b/, category: 'saas', severity: 'HIGH', description: 'Slack Bot Token' },
  { id: 'slack-user-token', regex: /\bxoxp-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24,}\b/, category: 'saas', severity: 'HIGH', description: 'Slack User Token' },
  { id: 'slack-app-token', regex: /\bxapp-[0-9]-[A-Z0-9]{10,}-[0-9]{10,}-[a-z0-9]{64}\b/, category: 'saas', severity: 'HIGH', description: 'Slack App Token' },
  { id: 'slack-webhook', regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]{8,}\/B[A-Z0-9]{8,}\/[A-Za-z0-9]{24}/, category: 'saas', severity: 'HIGH', description: 'Slack Webhook URL' },
  { id: 'slack-config-token', regex: /\bxoxe\.xoxp-1-[A-Za-z0-9]{160,}/, category: 'saas', severity: 'HIGH', description: 'Slack Configuration Token' },

  // Twilio (4 patterns)
  { id: 'twilio-account-sid', regex: /\bAC[a-f0-9]{32}\b/, category: 'saas', severity: 'MEDIUM', description: 'Twilio Account SID' },
  { id: 'twilio-auth-token', regex: /(?:TWILIO_AUTH_TOKEN|twilio_auth_token)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'CRITICAL', description: 'Twilio Auth Token' },
  { id: 'twilio-api-key', regex: /\bSK[a-f0-9]{32}\b/, category: 'saas', severity: 'HIGH', description: 'Twilio API Key SID' },
  { id: 'twilio-api-secret', regex: /(?:TWILIO_API_SECRET|twilio_api_secret)\s*[:=]\s*["']?([A-Za-z0-9]{32})/, category: 'saas', severity: 'CRITICAL', description: 'Twilio API Secret' },

  // SendGrid (2 patterns)
  { id: 'sendgrid-api-key', regex: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, category: 'saas', severity: 'HIGH', description: 'SendGrid API Key' },
  { id: 'sendgrid-env-key', regex: /(?:SENDGRID_API_KEY|sendgrid_key)\s*[:=]\s*["']?(SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43})/, category: 'saas', severity: 'HIGH', description: 'SendGrid Key in Env' },

  // Salesforce (4 patterns)
  { id: 'salesforce-oauth-token', regex: /(?:SALESFORCE_ACCESS_TOKEN|sf_access_token)\s*[:=]\s*["']?([A-Za-z0-9!.]{80,})/, category: 'saas', severity: 'HIGH', description: 'Salesforce OAuth Token' },
  { id: 'salesforce-refresh-token', regex: /(?:SALESFORCE_REFRESH_TOKEN|sf_refresh_token)\s*[:=]\s*["']?([A-Za-z0-9._!]{80,})/, category: 'saas', severity: 'HIGH', description: 'Salesforce Refresh Token' },
  { id: 'salesforce-client-secret', regex: /(?:SALESFORCE_CLIENT_SECRET|sf_client_secret)\s*[:=]\s*["']?([A-F0-9]{64})/, category: 'saas', severity: 'CRITICAL', description: 'Salesforce Client Secret' },
  { id: 'salesforce-security-token', regex: /(?:SALESFORCE_SECURITY_TOKEN|sf_security_token)\s*[:=]\s*["']?([A-Za-z0-9]{24,})/, category: 'saas', severity: 'HIGH', description: 'Salesforce Security Token' },

  // Jira / Atlassian (3 patterns)
  { id: 'atlassian-api-token', regex: /(?:ATLASSIAN_API_TOKEN|JIRA_API_TOKEN|jira_token)\s*[:=]\s*["']?([A-Za-z0-9]{24,})/, category: 'saas', severity: 'HIGH', description: 'Atlassian/Jira API Token' },
  { id: 'atlassian-oauth', regex: /(?:ATLASSIAN_OAUTH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'saas', severity: 'HIGH', description: 'Atlassian OAuth Token' },
  { id: 'confluence-api-token', regex: /(?:CONFLUENCE_API_TOKEN|confluence_token)\s*[:=]\s*["']?([A-Za-z0-9]{24,})/, category: 'saas', severity: 'HIGH', description: 'Confluence API Token' },

  // Zendesk (3 patterns)
  { id: 'zendesk-api-token', regex: /(?:ZENDESK_API_TOKEN|zendesk_token)\s*[:=]\s*["']?([A-Za-z0-9]{40})/, category: 'saas', severity: 'HIGH', description: 'Zendesk API Token' },
  { id: 'zendesk-oauth', regex: /(?:ZENDESK_OAUTH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'saas', severity: 'HIGH', description: 'Zendesk OAuth Token' },
  { id: 'zendesk-webhook', regex: /(?:ZENDESK_WEBHOOK_SECRET)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'saas', severity: 'HIGH', description: 'Zendesk Webhook Secret' },

  // Mailchimp (2 patterns)
  { id: 'mailchimp-api-key', regex: /[a-f0-9]{32}-us\d{1,2}/, category: 'saas', severity: 'HIGH', description: 'Mailchimp API Key' },
  { id: 'mailchimp-env-key', regex: /(?:MAILCHIMP_API_KEY|mailchimp_key)\s*[:=]\s*["']?([a-f0-9]{32}-us\d{1,2})/, category: 'saas', severity: 'HIGH', description: 'Mailchimp Key in Env' },

  // Datadog (2 patterns)
  { id: 'datadog-api-key', regex: /(?:DD_API_KEY|DATADOG_API_KEY|datadog_api_key)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'HIGH', description: 'Datadog API Key' },
  { id: 'datadog-app-key', regex: /(?:DD_APP_KEY|DATADOG_APP_KEY|datadog_app_key)\s*[:=]\s*["']?([a-f0-9]{40})/, category: 'saas', severity: 'HIGH', description: 'Datadog Application Key' },

  // New Relic (2 patterns)
  { id: 'newrelic-license-key', regex: /(?:NEW_RELIC_LICENSE_KEY|newrelic_license)\s*[:=]\s*["']?([a-f0-9]{40})/, category: 'saas', severity: 'HIGH', description: 'New Relic License Key' },
  { id: 'newrelic-api-key', regex: /\bNRAK-[A-Z0-9]{27}\b/, category: 'saas', severity: 'HIGH', description: 'New Relic API Key' },

  // PagerDuty (2 patterns)
  { id: 'pagerduty-api-key', regex: /(?:PAGERDUTY_API_KEY|pagerduty_key)\s*[:=]\s*["']?([A-Za-z0-9_-]{20})/, category: 'saas', severity: 'HIGH', description: 'PagerDuty API Key' },
  { id: 'pagerduty-integration-key', regex: /(?:PAGERDUTY_INTEGRATION_KEY)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'HIGH', description: 'PagerDuty Integration Key' },

  // Intercom (2 patterns)
  { id: 'intercom-access-token', regex: /(?:INTERCOM_ACCESS_TOKEN|intercom_token)\s*[:=]\s*["']?([a-z0-9=]{60,})/, category: 'saas', severity: 'HIGH', description: 'Intercom Access Token' },
  { id: 'intercom-client-secret', regex: /(?:INTERCOM_CLIENT_SECRET)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'saas', severity: 'CRITICAL', description: 'Intercom Client Secret' },

  // Shopify (3 patterns)
  { id: 'shopify-access-token', regex: /\bshpat_[a-f0-9]{32}\b/, category: 'saas', severity: 'HIGH', description: 'Shopify Admin Access Token' },
  { id: 'shopify-custom-app', regex: /\bshpca_[a-f0-9]{32}\b/, category: 'saas', severity: 'HIGH', description: 'Shopify Custom App Token' },
  { id: 'shopify-private-app', regex: /\bshppa_[a-f0-9]{32}\b/, category: 'saas', severity: 'HIGH', description: 'Shopify Private App Token' },

  // Airtable (1 pattern)
  { id: 'airtable-api-key', regex: /(?:AIRTABLE_API_KEY|airtable_key)\s*[:=]\s*["']?(key[A-Za-z0-9]{14})/, category: 'saas', severity: 'HIGH', description: 'Airtable API Key' },

  // Notion (1 pattern)
  { id: 'notion-integration-token', regex: /\bsecret_[A-Za-z0-9]{43}\b/, category: 'saas', severity: 'HIGH', description: 'Notion Integration Token' },

  // Linear (1 pattern)
  { id: 'linear-api-key', regex: /\blin_api_[A-Za-z0-9]{40}\b/, category: 'saas', severity: 'HIGH', description: 'Linear API Key' },

  // Sentry (2 patterns)
  { id: 'sentry-dsn', regex: /https:\/\/[a-f0-9]{32}@[a-z0-9.]+\.ingest\.sentry\.io\/\d+/, category: 'saas', severity: 'MEDIUM', description: 'Sentry DSN' },
  { id: 'sentry-auth-token', regex: /(?:SENTRY_AUTH_TOKEN|sentry_token)\s*[:=]\s*["']?([a-f0-9]{64})/, category: 'saas', severity: 'HIGH', description: 'Sentry Auth Token' },

  // Algolia (2 patterns)
  { id: 'algolia-admin-key', regex: /(?:ALGOLIA_ADMIN_KEY|algolia_admin_key)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'HIGH', description: 'Algolia Admin API Key' },
  { id: 'algolia-search-key', regex: /(?:ALGOLIA_SEARCH_KEY|algolia_search_key)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'MEDIUM', description: 'Algolia Search API Key' },

  // Segment (1 pattern)
  { id: 'segment-write-key', regex: /(?:SEGMENT_WRITE_KEY|segment_key)\s*[:=]\s*["']?([A-Za-z0-9]{32})/, category: 'saas', severity: 'HIGH', description: 'Segment Write Key' },

  // Mixpanel (1 pattern)
  { id: 'mixpanel-project-token', regex: /(?:MIXPANEL_TOKEN|mixpanel_token)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'MEDIUM', description: 'Mixpanel Project Token' },

  // LaunchDarkly (2 patterns)
  { id: 'launchdarkly-sdk-key', regex: /(?:LAUNCHDARKLY_SDK_KEY|ld_sdk_key)\s*[:=]\s*["']?(sdk-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'saas', severity: 'HIGH', description: 'LaunchDarkly SDK Key' },
  { id: 'launchdarkly-api-key', regex: /(?:LAUNCHDARKLY_API_KEY|ld_api_key)\s*[:=]\s*["']?(api-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'saas', severity: 'HIGH', description: 'LaunchDarkly API Key' },

  // Amplitude (1 pattern)
  { id: 'amplitude-api-key', regex: /(?:AMPLITUDE_API_KEY|amplitude_key)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'saas', severity: 'MEDIUM', description: 'Amplitude API Key' },

  // CircleCI (1 pattern)
  { id: 'circleci-token', regex: /(?:CIRCLECI_TOKEN|circle_token)\s*[:=]\s*["']?([a-f0-9]{40})/, category: 'saas', severity: 'HIGH', description: 'CircleCI Token' },

  // Travis CI (1 pattern)
  { id: 'travis-token', regex: /(?:TRAVIS_TOKEN|travis_api_token)\s*[:=]\s*["']?([A-Za-z0-9_-]{22,})/, category: 'saas', severity: 'HIGH', description: 'Travis CI Token' },

  // Vercel (1 pattern)
  { id: 'vercel-token', regex: /(?:VERCEL_TOKEN|vercel_token)\s*[:=]\s*["']?([A-Za-z0-9]{24})/, category: 'saas', severity: 'HIGH', description: 'Vercel Token' },

  // Netlify (1 pattern)
  { id: 'netlify-token', regex: /(?:NETLIFY_AUTH_TOKEN|netlify_token)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'saas', severity: 'HIGH', description: 'Netlify Auth Token' },

  // Heroku (1 pattern)
  { id: 'heroku-api-key', regex: /(?:HEROKU_API_KEY|heroku_key)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'saas', severity: 'HIGH', description: 'Heroku API Key' },
];
