/**
 * Generic secret detectors (~100 patterns)
 * Private keys, JWT tokens, OAuth tokens, generic API keys, passwords, etc.
 */
import { SecretPattern } from '../types';

/** Helper to generate parameterized "service API key" patterns */
function apiKeyPattern(service: string, envVar: string, minLen: number = 20): SecretPattern {
  const re = new RegExp(`(?:${envVar})\\s*[:=]\\s*["']?([A-Za-z0-9_-]{${minLen},})`);
  return {
    id: `generic-api-key-${service}`,
    regex: re,
    category: 'generic_key',
    severity: 'HIGH',
    description: `${service} API Key`,
  };
}

/** Helper to generate parameterized "service secret" patterns */
function secretPattern(service: string, envVar: string, minLen: number = 20): SecretPattern {
  const re = new RegExp(`(?:${envVar})\\s*[:=]\\s*["']?([A-Za-z0-9_-]{${minLen},})`);
  return {
    id: `generic-secret-${service}`,
    regex: re,
    category: 'generic_key',
    severity: 'HIGH',
    description: `${service} Secret`,
  };
}

/** Helper to generate parameterized "service password" patterns */
function passwordPattern(service: string, envVar: string): SecretPattern {
  const re = new RegExp(`(?:${envVar})\\s*[:=]\\s*["']?([^\\s"']{8,})`);
  return {
    id: `generic-password-${service}`,
    regex: re,
    category: 'generic_key',
    severity: 'HIGH',
    description: `${service} Password`,
  };
}

export const genericDetectors: SecretPattern[] = [
  // Private Keys (6 patterns)
  { id: 'rsa-private-key', regex: /-----BEGIN RSA PRIVATE KEY-----/, category: 'generic_key', severity: 'CRITICAL', description: 'RSA Private Key' },
  { id: 'ec-private-key', regex: /-----BEGIN EC PRIVATE KEY-----/, category: 'generic_key', severity: 'CRITICAL', description: 'EC Private Key' },
  { id: 'openssh-private-key', regex: /-----BEGIN OPENSSH PRIVATE KEY-----/, category: 'generic_key', severity: 'CRITICAL', description: 'OpenSSH Private Key' },
  { id: 'dsa-private-key', regex: /-----BEGIN DSA PRIVATE KEY-----/, category: 'generic_key', severity: 'CRITICAL', description: 'DSA Private Key' },
  { id: 'pgp-private-key', regex: /-----BEGIN PGP PRIVATE KEY BLOCK-----/, category: 'generic_key', severity: 'CRITICAL', description: 'PGP Private Key' },
  { id: 'pkcs8-private-key', regex: /-----BEGIN PRIVATE KEY-----/, category: 'generic_key', severity: 'CRITICAL', description: 'PKCS8 Private Key' },

  // JWT / Bearer (4 patterns)
  { id: 'jwt-token', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, category: 'generic_key', severity: 'HIGH', description: 'JWT Token' },
  { id: 'bearer-token', regex: /(?:Bearer|bearer)\s+([A-Za-z0-9._~+/=-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Bearer Token' },
  { id: 'authorization-header', regex: /(?:Authorization|authorization)\s*[:=]\s*["']?(?:Bearer|Basic)\s+([A-Za-z0-9._~+/=-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Authorization Header' },
  { id: 'basic-auth', regex: /(?:Basic)\s+([A-Za-z0-9+/=]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Basic Auth Credentials' },

  // OAuth (3 patterns)
  { id: 'oauth-client-secret', regex: /(?:client_secret|CLIENT_SECRET|oauth_secret)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'OAuth Client Secret' },
  { id: 'oauth-access-token', regex: /(?:access_token|ACCESS_TOKEN|oauth_token)\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'OAuth Access Token' },
  { id: 'oauth-refresh-token', regex: /(?:refresh_token|REFRESH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'OAuth Refresh Token' },

  // Generic API key patterns (5 patterns)
  { id: 'generic-api-key', regex: /(?:api_key|API_KEY|apiKey|ApiKey)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})/, category: 'generic_key', severity: 'HIGH', description: 'Generic API Key' },
  { id: 'generic-api-secret', regex: /(?:api_secret|API_SECRET|apiSecret)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})/, category: 'generic_key', severity: 'HIGH', description: 'Generic API Secret' },
  { id: 'generic-secret-key', regex: /(?:secret_key|SECRET_KEY|secretKey)\s*[:=]\s*["']?([A-Za-z0-9_-]{16,})/, category: 'generic_key', severity: 'HIGH', description: 'Generic Secret Key' },
  { id: 'generic-auth-token', regex: /(?:auth_token|AUTH_TOKEN|authToken)\s*[:=]\s*["']?([A-Za-z0-9._-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Generic Auth Token' },
  { id: 'generic-private-key-env', regex: /(?:PRIVATE_KEY|private_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'generic_key', severity: 'CRITICAL', description: 'Private Key in Environment' },

  // Generic password patterns (5 patterns)
  { id: 'generic-password', regex: /(?:password|PASSWORD|passwd|PASSWD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'generic_key', severity: 'HIGH', description: 'Generic Password' },
  { id: 'generic-db-password', regex: /(?:DB_PASSWORD|db_password|DATABASE_PASSWORD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'generic_key', severity: 'CRITICAL', description: 'Database Password' },
  { id: 'generic-admin-password', regex: /(?:ADMIN_PASSWORD|admin_password|ADMIN_PASS)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'generic_key', severity: 'CRITICAL', description: 'Admin Password' },
  { id: 'generic-root-password', regex: /(?:ROOT_PASSWORD|root_password|ROOT_PASS)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'generic_key', severity: 'CRITICAL', description: 'Root Password' },
  { id: 'generic-encryption-key', regex: /(?:ENCRYPTION_KEY|encryption_key|ENCRYPT_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{16,})/, category: 'generic_key', severity: 'CRITICAL', description: 'Encryption Key' },

  // Connection strings (3 patterns)
  { id: 'generic-connection-string', regex: /(?:CONNECTION_STRING|connection_string|DATABASE_URL)\s*[:=]\s*["']?([a-z]+:\/\/[^\s"']+)/, category: 'generic_key', severity: 'CRITICAL', description: 'Generic Connection String' },
  { id: 'generic-dsn', regex: /(?:DSN|dsn|SENTRY_DSN)\s*[:=]\s*["']?(https?:\/\/[^@]+@[^\s"']+)/, category: 'generic_key', severity: 'HIGH', description: 'Generic DSN' },
  { id: 'generic-smtp-password', regex: /(?:SMTP_PASSWORD|smtp_password|MAIL_PASSWORD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'generic_key', severity: 'HIGH', description: 'SMTP Password' },

  // Webhook / signing secrets (3 patterns)
  { id: 'generic-webhook-secret', regex: /(?:WEBHOOK_SECRET|webhook_secret|SIGNING_SECRET)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Webhook/Signing Secret' },
  { id: 'generic-hmac-secret', regex: /(?:HMAC_SECRET|hmac_secret|HMAC_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'HMAC Secret' },
  { id: 'generic-signing-key', regex: /(?:SIGNING_KEY|signing_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{20,})/, category: 'generic_key', severity: 'HIGH', description: 'Signing Key' },

  // Parameterized service API key patterns (50+ services)
  apiKeyPattern('Zapier', 'ZAPIER_API_KEY|zapier_key'),
  apiKeyPattern('Asana', 'ASANA_API_KEY|asana_token', 30),
  apiKeyPattern('Monday', 'MONDAY_API_KEY|monday_token'),
  apiKeyPattern('ClickUp', 'CLICKUP_API_KEY|clickup_token'),
  apiKeyPattern('Trello', 'TRELLO_API_KEY|trello_key'),
  apiKeyPattern('Discord', 'DISCORD_BOT_TOKEN|discord_token', 50),
  apiKeyPattern('Telegram', 'TELEGRAM_BOT_TOKEN|telegram_token', 30),
  apiKeyPattern('WhatsApp', 'WHATSAPP_TOKEN|whatsapp_key'),
  apiKeyPattern('Facebook', 'FACEBOOK_ACCESS_TOKEN|fb_token', 30),
  apiKeyPattern('Twitter', 'TWITTER_API_KEY|twitter_key'),
  apiKeyPattern('Instagram', 'INSTAGRAM_ACCESS_TOKEN|ig_token', 30),
  apiKeyPattern('LinkedIn', 'LINKEDIN_ACCESS_TOKEN|linkedin_token', 30),
  apiKeyPattern('Pinterest', 'PINTEREST_ACCESS_TOKEN|pinterest_token'),
  apiKeyPattern('YouTube', 'YOUTUBE_API_KEY|youtube_key'),
  apiKeyPattern('Spotify', 'SPOTIFY_CLIENT_SECRET|spotify_secret'),
  apiKeyPattern('Dropbox', 'DROPBOX_ACCESS_TOKEN|dropbox_token', 40),
  apiKeyPattern('Box', 'BOX_ACCESS_TOKEN|box_token'),
  apiKeyPattern('OneDrive', 'ONEDRIVE_ACCESS_TOKEN|onedrive_token'),
  apiKeyPattern('GoogleDrive', 'GOOGLE_DRIVE_TOKEN|gdrive_token'),
  apiKeyPattern('Zoom', 'ZOOM_API_KEY|zoom_key'),
  apiKeyPattern('Webex', 'WEBEX_ACCESS_TOKEN|webex_token', 40),
  apiKeyPattern('Okta', 'OKTA_API_TOKEN|okta_token'),
  apiKeyPattern('Auth0', 'AUTH0_CLIENT_SECRET|auth0_secret'),
  apiKeyPattern('Firebase', 'FIREBASE_TOKEN|firebase_token'),
  apiKeyPattern('Supabase', 'SUPABASE_KEY|supabase_key'),
  apiKeyPattern('Contentful', 'CONTENTFUL_ACCESS_TOKEN|contentful_token'),
  apiKeyPattern('Sanity', 'SANITY_TOKEN|sanity_token'),
  apiKeyPattern('Strapi', 'STRAPI_TOKEN|strapi_key'),
  apiKeyPattern('Prismic', 'PRISMIC_ACCESS_TOKEN|prismic_token'),
  apiKeyPattern('Cloudinary', 'CLOUDINARY_API_SECRET|cloudinary_secret'),
  apiKeyPattern('Imgix', 'IMGIX_API_KEY|imgix_key'),
  apiKeyPattern('Mapbox', 'MAPBOX_ACCESS_TOKEN|mapbox_token', 40),
  apiKeyPattern('GoogleMaps', 'GOOGLE_MAPS_API_KEY|gmaps_key'),
  apiKeyPattern('Twitch', 'TWITCH_CLIENT_SECRET|twitch_secret'),
  apiKeyPattern('Reddit', 'REDDIT_CLIENT_SECRET|reddit_secret'),
  apiKeyPattern('StackOverflow', 'STACKOVERFLOW_KEY|so_key'),
  apiKeyPattern('NPM', 'NPM_TOKEN|npm_token'),
  apiKeyPattern('PyPI', 'PYPI_TOKEN|pypi_token'),
  apiKeyPattern('RubyGems', 'RUBYGEMS_API_KEY|rubygems_key'),
  apiKeyPattern('NuGet', 'NUGET_API_KEY|nuget_key'),
  apiKeyPattern('Homebrew', 'HOMEBREW_GITHUB_API_TOKEN|brew_token'),
  apiKeyPattern('Snyk', 'SNYK_TOKEN|snyk_token'),
  apiKeyPattern('SonarQube', 'SONAR_TOKEN|sonarqube_token'),
  apiKeyPattern('Codecov', 'CODECOV_TOKEN|codecov_token'),
  apiKeyPattern('Coveralls', 'COVERALLS_REPO_TOKEN|coveralls_token'),

  // Parameterized service secret patterns
  secretPattern('Stripe', 'STRIPE_SECRET_KEY|stripe_secret'),
  secretPattern('Twilio', 'TWILIO_AUTH_TOKEN_SECRET|twilio_secret'),
  secretPattern('AWS', 'AWS_SECRET_ACCESS_KEY|aws_secret'),
  secretPattern('Azure', 'AZURE_SECRET|azure_secret'),
  secretPattern('GCP', 'GCP_SECRET|gcp_secret'),

  // Parameterized password patterns
  passwordPattern('App', 'APP_PASSWORD|app_password'),
  passwordPattern('Service', 'SERVICE_PASSWORD|service_password'),
  passwordPattern('System', 'SYSTEM_PASSWORD|system_password'),
  passwordPattern('User', 'USER_PASSWORD|user_password'),
  passwordPattern('Master', 'MASTER_PASSWORD|master_password'),
];
