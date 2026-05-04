/**
 * Infrastructure secret detectors (~30 patterns)
 * Docker, Kubernetes, Terraform, Vault, Consul, Ansible, etc.
 */
import { SecretPattern } from '../types';

export const infrastructureDetectors: SecretPattern[] = [
  // Docker (4 patterns)
  { id: 'docker-registry-password', regex: /(?:DOCKER_PASSWORD|docker_password|DOCKER_REGISTRY_PASSWORD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'infrastructure', severity: 'HIGH', description: 'Docker Registry Password' },
  { id: 'docker-auth-config', regex: /(?:DOCKER_AUTH_CONFIG)\s*[:=]\s*["']?\{[^}]*"auth"\s*:\s*"([A-Za-z0-9+/=]{20,})"/, category: 'infrastructure', severity: 'HIGH', description: 'Docker Auth Config' },
  { id: 'docker-hub-token', regex: /(?:DOCKER_HUB_TOKEN|dockerhub_token)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'infrastructure', severity: 'HIGH', description: 'Docker Hub Token' },
  { id: 'docker-swarm-token', regex: /SWMTKN-1-[a-z0-9]{49}-[a-z0-9]{25}/, category: 'infrastructure', severity: 'CRITICAL', description: 'Docker Swarm Join Token' },

  // Kubernetes (5 patterns)
  { id: 'k8s-service-account-token', regex: /(?:KUBERNETES_SERVICE_ACCOUNT_TOKEN|K8S_TOKEN)\s*[:=]\s*["']?(eyJ[A-Za-z0-9_-]{100,})/, category: 'infrastructure', severity: 'CRITICAL', description: 'Kubernetes Service Account Token' },
  { id: 'k8s-bearer-token', regex: /(?:bearer_token|KUBE_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9._-]{100,})/, category: 'infrastructure', severity: 'CRITICAL', description: 'Kubernetes Bearer Token' },
  { id: 'k8s-client-cert', regex: /(?:client-certificate-data|KUBE_CLIENT_CERT)\s*[:=]\s*["']?([A-Za-z0-9+/=]{100,})/, category: 'infrastructure', severity: 'HIGH', description: 'Kubernetes Client Certificate' },
  { id: 'k8s-client-key', regex: /(?:client-key-data|KUBE_CLIENT_KEY)\s*[:=]\s*["']?([A-Za-z0-9+/=]{100,})/, category: 'infrastructure', severity: 'CRITICAL', description: 'Kubernetes Client Key' },
  { id: 'k8s-ca-cert', regex: /(?:certificate-authority-data)\s*[:=]\s*["']?([A-Za-z0-9+/=]{100,})/, category: 'infrastructure', severity: 'MEDIUM', description: 'Kubernetes CA Certificate' },

  // Terraform (4 patterns)
  { id: 'terraform-cloud-token', regex: /(?:TF_API_TOKEN|terraform_token|TFE_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9._-]{14,})/, category: 'infrastructure', severity: 'HIGH', description: 'Terraform Cloud Token' },
  { id: 'terraform-state-password', regex: /(?:TF_HTTP_PASSWORD|terraform_state_password)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'infrastructure', severity: 'HIGH', description: 'Terraform State Password' },
  { id: 'terraform-backend-key', regex: /(?:backend_access_key|TF_BACKEND_KEY)\s*[:=]\s*["']?([A-Za-z0-9/+=]{40,})/, category: 'infrastructure', severity: 'HIGH', description: 'Terraform Backend Key' },
  { id: 'terraform-var-secret', regex: /(?:TF_VAR_secret|TF_VAR_password|TF_VAR_api_key)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'infrastructure', severity: 'HIGH', description: 'Terraform Variable Secret' },

  // HashiCorp Vault (3 patterns)
  { id: 'vault-token', regex: /(?:VAULT_TOKEN|vault_token)\s*[:=]\s*["']?(hvs\.[A-Za-z0-9_-]{24,})/, category: 'infrastructure', severity: 'CRITICAL', description: 'HashiCorp Vault Token' },
  { id: 'vault-root-token', regex: /\bhvs\.[A-Za-z0-9_-]{24,}\b/, category: 'infrastructure', severity: 'CRITICAL', description: 'HashiCorp Vault Root Token' },
  { id: 'vault-unseal-key', regex: /(?:VAULT_UNSEAL_KEY|vault_unseal)\s*[:=]\s*["']?([A-Za-z0-9+/=]{44})/, category: 'infrastructure', severity: 'CRITICAL', description: 'HashiCorp Vault Unseal Key' },

  // Consul (2 patterns)
  { id: 'consul-token', regex: /(?:CONSUL_HTTP_TOKEN|consul_token)\s*[:=]\s*["']?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/, category: 'infrastructure', severity: 'HIGH', description: 'HashiCorp Consul Token' },
  { id: 'consul-encrypt-key', regex: /(?:consul_encrypt|CONSUL_ENCRYPT)\s*[:=]\s*["']?([A-Za-z0-9+/=]{24,})/, category: 'infrastructure', severity: 'HIGH', description: 'Consul Encryption Key' },

  // Ansible (2 patterns)
  { id: 'ansible-vault-password', regex: /(?:ANSIBLE_VAULT_PASSWORD|ansible_vault_pass)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'infrastructure', severity: 'HIGH', description: 'Ansible Vault Password' },
  { id: 'ansible-tower-token', regex: /(?:TOWER_OAUTH_TOKEN|ansible_tower_token)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'infrastructure', severity: 'HIGH', description: 'Ansible Tower Token' },

  // Pulumi (2 patterns)
  { id: 'pulumi-access-token', regex: /\bpul-[a-f0-9]{40}\b/, category: 'infrastructure', severity: 'HIGH', description: 'Pulumi Access Token' },
  { id: 'pulumi-env-token', regex: /(?:PULUMI_ACCESS_TOKEN)\s*[:=]\s*["']?(pul-[a-f0-9]{40})/, category: 'infrastructure', severity: 'HIGH', description: 'Pulumi Token in Env' },

  // Grafana (2 patterns)
  { id: 'grafana-api-key', regex: /\beyJr[A-Za-z0-9_-]{50,}/, category: 'infrastructure', severity: 'HIGH', description: 'Grafana API Key' },
  { id: 'grafana-service-account', regex: /\bglsa_[A-Za-z0-9_]{32,}\b/, category: 'infrastructure', severity: 'HIGH', description: 'Grafana Service Account Token' },

  // Prometheus (1 pattern)
  { id: 'prometheus-remote-write', regex: /(?:PROMETHEUS_REMOTE_WRITE_PASSWORD)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'infrastructure', severity: 'HIGH', description: 'Prometheus Remote Write Password' },

  // Nginx (1 pattern)
  { id: 'nginx-ssl-key', regex: /(?:ssl_certificate_key)\s+([^\s;]+\.key)/, category: 'infrastructure', severity: 'HIGH', description: 'Nginx SSL Key Path' },

  // Chef (1 pattern)
  { id: 'chef-private-key', regex: /(?:CHEF_PRIVATE_KEY|chef_key)\s*[:=]\s*["']?([A-Za-z0-9+/=]{40,})/, category: 'infrastructure', severity: 'HIGH', description: 'Chef Private Key' },

  // Puppet (1 pattern)
  { id: 'puppet-token', regex: /(?:PUPPET_TOKEN|puppet_token)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'infrastructure', severity: 'HIGH', description: 'Puppet Token' },
];
