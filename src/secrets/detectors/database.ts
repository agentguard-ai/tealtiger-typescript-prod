/**
 * Database secret detectors (~20 patterns)
 * PostgreSQL, MySQL, MongoDB, Redis, Elasticsearch, etc.
 */
import { SecretPattern } from '../types';

export const databaseDetectors: SecretPattern[] = [
  // PostgreSQL (3 patterns)
  { id: 'postgres-connection-string', regex: /postgres(?:ql)?:\/\/[^:]+:[^@]+@[^/]+\/[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'PostgreSQL Connection String' },
  { id: 'postgres-password', regex: /(?:PGPASSWORD|pg_password|postgres_password)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'CRITICAL', description: 'PostgreSQL Password' },
  { id: 'postgres-ssl-key', regex: /(?:pgsslkey|PG_SSL_KEY)\s*[:=]\s*["']?([^\s"']+\.pem)/, category: 'database', severity: 'HIGH', description: 'PostgreSQL SSL Key Path' },

  // MySQL (3 patterns)
  { id: 'mysql-connection-string', regex: /mysql:\/\/[^:]+:[^@]+@[^/]+\/[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'MySQL Connection String' },
  { id: 'mysql-password', regex: /(?:MYSQL_PASSWORD|mysql_password|MYSQL_ROOT_PASSWORD)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'CRITICAL', description: 'MySQL Password' },
  { id: 'mysql-ssl-cert', regex: /(?:mysql_ssl_cert|MYSQL_SSL_CERT)\s*[:=]\s*["']?([^\s"']+\.pem)/, category: 'database', severity: 'HIGH', description: 'MySQL SSL Certificate Path' },

  // MongoDB (3 patterns)
  { id: 'mongodb-connection-string', regex: /mongodb(?:\+srv)?:\/\/[^:]+:[^@]+@[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'MongoDB Connection String' },
  { id: 'mongodb-password', regex: /(?:MONGO_PASSWORD|mongodb_password|MONGO_INITDB_ROOT_PASSWORD)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'CRITICAL', description: 'MongoDB Password' },
  { id: 'mongodb-atlas-key', regex: /(?:MONGODB_ATLAS_API_KEY|atlas_api_key)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'database', severity: 'HIGH', description: 'MongoDB Atlas API Key' },

  // Redis (3 patterns)
  { id: 'redis-connection-string', regex: /redis(?:s)?:\/\/[^:]*:[^@]+@[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'Redis Connection String' },
  { id: 'redis-password', regex: /(?:REDIS_PASSWORD|redis_password|REDIS_AUTH)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'HIGH', description: 'Redis Password' },
  { id: 'redis-url', regex: /(?:REDIS_URL|redis_url)\s*[:=]\s*["']?(redis(?:s)?:\/\/[^\s"']+)/, category: 'database', severity: 'HIGH', description: 'Redis URL' },

  // Elasticsearch (2 patterns)
  { id: 'elasticsearch-password', regex: /(?:ELASTIC_PASSWORD|elasticsearch_password|ES_PASSWORD)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'HIGH', description: 'Elasticsearch Password' },
  { id: 'elasticsearch-api-key', regex: /(?:ELASTIC_API_KEY|elasticsearch_api_key)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'database', severity: 'HIGH', description: 'Elasticsearch API Key' },

  // CockroachDB (1 pattern)
  { id: 'cockroachdb-connection', regex: /cockroachdb:\/\/[^:]+:[^@]+@[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'CockroachDB Connection String' },

  // Cassandra (1 pattern)
  { id: 'cassandra-password', regex: /(?:CASSANDRA_PASSWORD|cassandra_password)\s*[:=]\s*["']?([^\s"']{6,})/, category: 'database', severity: 'HIGH', description: 'Cassandra Password' },

  // DynamoDB (1 pattern)
  { id: 'dynamodb-endpoint-key', regex: /(?:DYNAMODB_ENDPOINT_KEY|dynamodb_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'database', severity: 'HIGH', description: 'DynamoDB Endpoint Key' },

  // Supabase (2 patterns)
  { id: 'supabase-anon-key', regex: /(?:SUPABASE_ANON_KEY|supabase_anon_key)\s*[:=]\s*["']?(eyJ[A-Za-z0-9_-]{100,})/, category: 'database', severity: 'MEDIUM', description: 'Supabase Anon Key' },
  { id: 'supabase-service-key', regex: /(?:SUPABASE_SERVICE_ROLE_KEY|supabase_service_key)\s*[:=]\s*["']?(eyJ[A-Za-z0-9_-]{100,})/, category: 'database', severity: 'CRITICAL', description: 'Supabase Service Role Key' },

  // PlanetScale (1 pattern)
  { id: 'planetscale-password', regex: /(?:DATABASE_URL)\s*[:=]\s*["']?mysql:\/\/[^:]+:pscale_pw_[A-Za-z0-9_-]+@[^\s"']+/, category: 'database', severity: 'CRITICAL', description: 'PlanetScale Database URL' },
];
