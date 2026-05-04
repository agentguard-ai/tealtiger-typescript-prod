/**
 * VCS (Version Control System) secret detectors (~20 patterns)
 * GitHub, GitLab, Bitbucket, Azure DevOps
 */
import { SecretPattern } from '../types';

export const vcsDetectors: SecretPattern[] = [
  // GitHub (8 patterns)
  { id: 'github-pat', regex: /\bghp_[0-9A-Za-z]{36}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitHub Personal Access Token' },
  { id: 'github-oauth', regex: /\bgho_[0-9A-Za-z]{36}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitHub OAuth Token' },
  { id: 'github-server', regex: /\bghs_[0-9A-Za-z]{36}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitHub Server-to-Server Token' },
  { id: 'github-user-server', regex: /\bghu_[0-9A-Za-z]{36}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitHub User-to-Server Token' },
  { id: 'github-refresh', regex: /\bghr_[0-9A-Za-z]{36}\b/, category: 'vcs', severity: 'HIGH', description: 'GitHub Refresh Token' },
  { id: 'github-fine-grained', regex: /\bgithub_pat_[0-9A-Za-z_]{82}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitHub Fine-Grained PAT' },
  { id: 'github-app-token', regex: /(?:ghs|v1\.)[a-f0-9]{40}/, category: 'vcs', severity: 'HIGH', description: 'GitHub App Installation Token' },
  { id: 'github-actions-secret', regex: /(?:GITHUB_TOKEN|GH_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{36,})/, category: 'vcs', severity: 'HIGH', description: 'GitHub Actions Secret' },

  // GitLab (6 patterns)
  { id: 'gitlab-pat', regex: /\bglpat-[0-9A-Za-z_-]{20}\b/, category: 'vcs', severity: 'CRITICAL', description: 'GitLab Personal Access Token' },
  { id: 'gitlab-pipeline', regex: /\bglptt-[0-9a-f]{40}\b/, category: 'vcs', severity: 'HIGH', description: 'GitLab Pipeline Trigger Token' },
  { id: 'gitlab-runner', regex: /\bGR1348941[0-9A-Za-z_-]{20}\b/, category: 'vcs', severity: 'HIGH', description: 'GitLab Runner Registration Token' },
  { id: 'gitlab-ci-token', regex: /(?:CI_JOB_TOKEN|GITLAB_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'vcs', severity: 'HIGH', description: 'GitLab CI Token' },
  { id: 'gitlab-deploy-token', regex: /(?:gitlab_deploy_token|GITLAB_DEPLOY_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9_-]{20,})/, category: 'vcs', severity: 'HIGH', description: 'GitLab Deploy Token' },
  { id: 'gitlab-oauth', regex: /(?:gitlab_oauth|GITLAB_OAUTH)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'vcs', severity: 'HIGH', description: 'GitLab OAuth Token' },

  // Bitbucket (4 patterns)
  { id: 'bitbucket-app-password', regex: /(?:bitbucket_app_password|BITBUCKET_APP_PASSWORD)\s*[:=]\s*["']?([A-Za-z0-9]{18,})/, category: 'vcs', severity: 'HIGH', description: 'Bitbucket App Password' },
  { id: 'bitbucket-oauth', regex: /(?:bitbucket_oauth_token|BITBUCKET_OAUTH)\s*[:=]\s*["']?([A-Za-z0-9_-]{40,})/, category: 'vcs', severity: 'HIGH', description: 'Bitbucket OAuth Token' },
  { id: 'bitbucket-server-token', regex: /(?:bitbucket_server_token|BITBUCKET_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9]{24,})/, category: 'vcs', severity: 'HIGH', description: 'Bitbucket Server Token' },
  { id: 'bitbucket-pipeline-var', regex: /(?:BITBUCKET_VARIABLE|bitbucket_pipeline_var)\s*[:=]\s*["']?([^\s"']{8,})/, category: 'vcs', severity: 'MEDIUM', description: 'Bitbucket Pipeline Variable' },

  // Azure DevOps (2 patterns)
  { id: 'azure-devops-pat-vcs', regex: /(?:AZURE_DEVOPS_EXT_PAT|SYSTEM_ACCESSTOKEN)\s*[:=]\s*["']?([a-z0-9]{52})/, category: 'vcs', severity: 'HIGH', description: 'Azure DevOps PAT' },
  { id: 'azure-devops-feed', regex: /(?:AZURE_ARTIFACTS_FEED_TOKEN)\s*[:=]\s*["']?([A-Za-z0-9]{52,})/, category: 'vcs', severity: 'HIGH', description: 'Azure DevOps Feed Token' },
];
