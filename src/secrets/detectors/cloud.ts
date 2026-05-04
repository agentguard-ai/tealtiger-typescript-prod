/**
 * Cloud provider secret detectors (~50 patterns)
 * AWS, Azure, GCP, DigitalOcean, Alibaba, Oracle, IBM
 */
import { SecretPattern } from '../types';

export const cloudDetectors: SecretPattern[] = [
  // AWS (15 patterns)
  { id: 'aws-access-key-id', regex: /\b(AKIA[0-9A-Z]{16})\b/, category: 'cloud', severity: 'CRITICAL', description: 'AWS Access Key ID' },
  { id: 'aws-temp-access-key', regex: /\b(ASIA[0-9A-Z]{16})\b/, category: 'cloud', severity: 'CRITICAL', description: 'AWS Temporary Access Key' },
  { id: 'aws-secret-access-key', regex: /\b([A-Za-z0-9/+=]{40})\b(?=.*(?:aws_secret|AWS_SECRET|secret_access_key))/, category: 'cloud', severity: 'CRITICAL', description: 'AWS Secret Access Key' },
  { id: 'aws-session-token', regex: /(?:aws_session_token|AWS_SESSION_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9/+=]{100,})/, category: 'cloud', severity: 'HIGH', description: 'AWS Session Token' },
  { id: 'aws-mws-key', regex: /amzn\.mws\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, category: 'cloud', severity: 'HIGH', description: 'AWS MWS Key' },
  { id: 'aws-cognito-pool', regex: /(?:us|eu|ap|sa|ca|me|af)-(?:east|west|south|north|central|southeast|northeast)-\d:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, category: 'cloud', severity: 'MEDIUM', description: 'AWS Cognito Pool ID' },
  { id: 'aws-account-id', regex: /(?:aws_account_id|AWS_ACCOUNT_ID)\s*[:=]\s*["']?(\d{12})/, category: 'cloud', severity: 'LOW', description: 'AWS Account ID' },
  { id: 'aws-arn', regex: /arn:aws:[a-z0-9-]+:[a-z0-9-]*:\d{12}:[a-zA-Z0-9/_-]+/, category: 'cloud', severity: 'LOW', description: 'AWS ARN' },
  { id: 'aws-lambda-env', regex: /(?:LAMBDA_TASK_ROOT|AWS_LAMBDA_FUNCTION_NAME)\s*[:=]\s*["']?([^\s"']+)/, category: 'cloud', severity: 'LOW', description: 'AWS Lambda Environment' },
  { id: 'aws-rds-token', regex: /(?:rds_auth_token|RDS_AUTH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9/+=]{100,})/, category: 'cloud', severity: 'HIGH', description: 'AWS RDS Auth Token' },
  { id: 'aws-ses-smtp', regex: /(?:ses_smtp_password|SES_SMTP_PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'AWS SES SMTP Password' },
  { id: 'aws-cloudfront-key', regex: /(?:cloudfront_key_pair_id|CLOUDFRONT_KEY)\s*[:=]\s*["']?([A-Z0-9]{14,})/, category: 'cloud', severity: 'HIGH', description: 'AWS CloudFront Key Pair' },
  { id: 'aws-s3-presigned', regex: /https:\/\/[a-z0-9.-]+\.s3[a-z0-9.-]*\.amazonaws\.com\/[^\s]*X-Amz-Signature=[a-f0-9]{64}/, category: 'cloud', severity: 'MEDIUM', description: 'AWS S3 Presigned URL' },
  { id: 'aws-iot-key', regex: /(?:iot_private_key|IOT_PRIVATE_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'AWS IoT Private Key' },
  { id: 'aws-kms-key', regex: /(?:kms_key_id|KMS_KEY_ID)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'cloud', severity: 'MEDIUM', description: 'AWS KMS Key ID' },

  // Azure (12 patterns)
  { id: 'azure-storage-key', regex: /(?:AccountKey|azure_storage_key)\s*[:=]\s*["']?([A-Za-z0-9/+=]{86,88}==)/, category: 'cloud', severity: 'CRITICAL', description: 'Azure Storage Account Key' },
  { id: 'azure-sas-token', regex: /[?&]sig=[A-Za-z0-9%/+=]{40,}/, category: 'cloud', severity: 'HIGH', description: 'Azure SAS Token' },
  { id: 'azure-connection-string', regex: /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[A-Za-z0-9/+=]{86,88}==/, category: 'cloud', severity: 'CRITICAL', description: 'Azure Connection String' },
  { id: 'azure-client-secret', regex: /(?:azure_client_secret|AZURE_CLIENT_SECRET)\s*[:=]\s*["']?([A-Za-z0-9~._-]{34,})/, category: 'cloud', severity: 'CRITICAL', description: 'Azure Client Secret' },
  { id: 'azure-tenant-id', regex: /(?:azure_tenant_id|AZURE_TENANT_ID)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'cloud', severity: 'MEDIUM', description: 'Azure Tenant ID' },
  { id: 'azure-subscription-id', regex: /(?:azure_subscription_id|AZURE_SUBSCRIPTION_ID)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'cloud', severity: 'MEDIUM', description: 'Azure Subscription ID' },
  { id: 'azure-cosmos-key', regex: /(?:cosmos_key|COSMOS_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{86,88}==)/, category: 'cloud', severity: 'CRITICAL', description: 'Azure Cosmos DB Key' },
  { id: 'azure-devops-pat', regex: /(?:azure_devops_pat|AZURE_DEVOPS_PAT)\s*[:=]\s*["']?([a-z0-9]{52})/, category: 'cloud', severity: 'HIGH', description: 'Azure DevOps PAT' },
  { id: 'azure-function-key', regex: /(?:x-functions-key|azure_function_key)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'cloud', severity: 'HIGH', description: 'Azure Function Key' },
  { id: 'azure-cognitive-key', regex: /(?:cognitive_services_key|COGNITIVE_KEY)\s*[:=]\s*["']?([a-f0-9]{32})/, category: 'cloud', severity: 'HIGH', description: 'Azure Cognitive Services Key' },
  { id: 'azure-service-bus', regex: /Endpoint=sb:\/\/[^;]+;SharedAccessKeyName=[^;]+;SharedAccessKey=[A-Za-z0-9/+=]{40,}/, category: 'cloud', severity: 'HIGH', description: 'Azure Service Bus Connection' },
  { id: 'azure-event-hub', regex: /Endpoint=sb:\/\/[^;]+\.servicebus\.windows\.net\/;SharedAccessKeyName=[^;]+;SharedAccessKey=[A-Za-z0-9/+=]+/, category: 'cloud', severity: 'HIGH', description: 'Azure Event Hub Connection' },

  // GCP (12 patterns)
  { id: 'gcp-api-key', regex: /\bAIza[0-9A-Za-z_-]{35}\b/, category: 'cloud', severity: 'HIGH', description: 'GCP API Key' },
  { id: 'gcp-service-account', regex: /[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com/, category: 'cloud', severity: 'MEDIUM', description: 'GCP Service Account Email' },
  { id: 'gcp-oauth-token', regex: /ya29\.[0-9A-Za-z_-]{50,}/, category: 'cloud', severity: 'HIGH', description: 'GCP OAuth Token' },
  { id: 'gcp-private-key-id', regex: /(?:private_key_id|PRIVATE_KEY_ID)\s*[:=]\s*["']?([a-f0-9]{40})/, category: 'cloud', severity: 'HIGH', description: 'GCP Private Key ID' },
  { id: 'gcp-project-id', regex: /(?:gcp_project|GCP_PROJECT|GOOGLE_CLOUD_PROJECT)\s*[:=]\s*["']?([a-z][a-z0-9-]{4,28}[a-z0-9])/, category: 'cloud', severity: 'LOW', description: 'GCP Project ID' },
  { id: 'gcp-firebase-key', regex: /(?:firebase_api_key|FIREBASE_API_KEY)\s*[:=]\s*["']?AIza[0-9A-Za-z_-]{35}/, category: 'cloud', severity: 'HIGH', description: 'GCP Firebase API Key' },
  { id: 'gcp-firebase-url', regex: /https:\/\/[a-z0-9-]+\.firebaseio\.com/, category: 'cloud', severity: 'LOW', description: 'GCP Firebase Database URL' },
  { id: 'gcp-cloud-sql', regex: /(?:cloud_sql_password|CLOUD_SQL_PASSWORD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'cloud', severity: 'HIGH', description: 'GCP Cloud SQL Password' },
  { id: 'gcp-storage-hmac', regex: /(?:GOOG[A-Z0-9]{16})/, category: 'cloud', severity: 'HIGH', description: 'GCP Storage HMAC Key' },
  { id: 'gcp-bigquery-key', regex: /(?:bigquery_key|BIGQUERY_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'GCP BigQuery Key' },
  { id: 'gcp-pubsub-key', regex: /(?:pubsub_key|PUBSUB_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'GCP Pub/Sub Key' },
  { id: 'gcp-datastore-key', regex: /(?:datastore_key|DATASTORE_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'GCP Datastore Key' },

  // DigitalOcean (3 patterns)
  { id: 'digitalocean-pat', regex: /\bdop_v1_[a-f0-9]{64}\b/, category: 'cloud', severity: 'HIGH', description: 'DigitalOcean Personal Access Token' },
  { id: 'digitalocean-oauth', regex: /\bdoo_v1_[a-f0-9]{64}\b/, category: 'cloud', severity: 'HIGH', description: 'DigitalOcean OAuth Token' },
  { id: 'digitalocean-refresh', regex: /\bdor_v1_[a-f0-9]{64}\b/, category: 'cloud', severity: 'HIGH', description: 'DigitalOcean Refresh Token' },

  // Alibaba Cloud (3 patterns)
  { id: 'alibaba-access-key', regex: /\bLTAI[0-9A-Za-z]{20}\b/, category: 'cloud', severity: 'CRITICAL', description: 'Alibaba Cloud Access Key' },
  { id: 'alibaba-secret-key', regex: /(?:alibaba_secret|ALIBABA_SECRET)\s*[:=]\s*["']?([A-Za-z0-9]{30})/, category: 'cloud', severity: 'CRITICAL', description: 'Alibaba Cloud Secret Key' },
  { id: 'alibaba-oss-token', regex: /(?:oss_security_token|OSS_SECURITY_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9/+=]{100,})/, category: 'cloud', severity: 'HIGH', description: 'Alibaba OSS Security Token' },

  // Oracle Cloud (2 patterns)
  { id: 'oracle-cloud-tenancy', regex: /(?:oci_tenancy|OCI_TENANCY)\s*[:=]\s*["']?(ocid1\.tenancy\.oc1\.\.[a-z0-9]{60})/, category: 'cloud', severity: 'MEDIUM', description: 'Oracle Cloud Tenancy OCID' },
  { id: 'oracle-cloud-key', regex: /(?:oci_api_key|OCI_API_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'cloud', severity: 'HIGH', description: 'Oracle Cloud API Key' },

  // IBM Cloud (3 patterns)
  { id: 'ibm-cloud-api-key', regex: /(?:ibm_api_key|IBM_API_KEY|ibmcloud_api_key)\s*[:=]\s*["']?([A-Za-z0-9_-]{44})/, category: 'cloud', severity: 'HIGH', description: 'IBM Cloud API Key' },
  { id: 'ibm-cos-hmac', regex: /(?:ibm_cos_hmac|IBM_COS_HMAC)\s*[:=]\s*["']?([a-f0-9]{64})/, category: 'cloud', severity: 'HIGH', description: 'IBM Cloud Object Storage HMAC' },
  { id: 'ibm-iam-token', regex: /(?:ibm_iam_token|IBM_IAM_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9._-]{100,})/, category: 'cloud', severity: 'HIGH', description: 'IBM IAM Token' },
];
