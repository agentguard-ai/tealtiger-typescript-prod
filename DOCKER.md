# TealTiger TypeScript SDK - Docker Guide

This guide covers how to use TealTiger TypeScript SDK with Docker.

## Quick Start

### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/tealtiger/typescript-sdk:latest

# Run interactively
docker run -it --rm \
  -e OPENAI_API_KEY=your-key \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node
```

### Run Examples

```bash
# Run a specific example
docker run --rm \
  -e OPENAI_API_KEY=your-key \
  -v $(pwd)/examples:/app/examples \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node /app/examples/guarded-openai-demo.js
```

## Available Images

### Production
- **Image:** `ghcr.io/tealtiger/typescript-sdk:latest`
- **Size:** ~150MB
- **Use:** Production deployments
- **Includes:** TealTiger SDK, examples

### Development
- **Image:** `ghcr.io/tealtiger/typescript-sdk:dev`
- **Size:** ~300MB
- **Use:** Development and testing
- **Includes:** SDK + dev tools (jest, eslint, typescript)

## Usage Examples

### Interactive Node.js Shell

```bash
docker run -it --rm \
  -e OPENAI_API_KEY=sk-xxx \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node

# In Node.js:
> const { TealOpenAI } = require('tealtiger');
> const client = new TealOpenAI({ apiKey: 'sk-xxx' });
> // Start using TealTiger!
```

### Mount Your Code

```bash
# Mount current directory
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  -e OPENAI_API_KEY=sk-xxx \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node my_script.js
```

### Development Environment

```bash
# Start dev container with bash
docker run -it --rm \
  -v $(pwd):/app \
  -e OPENAI_API_KEY=sk-xxx \
  ghcr.io/tealtiger/typescript-sdk:dev \
  bash

# Inside container:
$ npm test
$ npm run lint
$ npm run build
```



## Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  tealtiger:
    image: ghcr.io/tealtiger/typescript-sdk:latest
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    volumes:
      - ./workspace:/workspace
    working_dir: /workspace
```

Run with:
```bash
docker-compose run tealtiger node my_script.js
```

## CI/CD Integration

### GitHub Actions

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    container:
      image: ghcr.io/tealtiger/typescript-sdk:latest
    steps:
      - uses: actions/checkout@v3
      - run: npm test
```

### GitLab CI

```yaml
test:
  image: ghcr.io/tealtiger/typescript-sdk:latest
  script:
    - npm test
```

## Building Locally

### Build Production Image

```bash
cd packages/tealtiger-sdk
docker build -t tealtiger/typescript-sdk:latest .
```

### Build All Variants

```bash
# Production
docker build -t tealtiger/typescript-sdk:latest -f Dockerfile .

# Development
docker build -t tealtiger/typescript-sdk:dev -f Dockerfile.dev .
```

### Using Docker Compose

```bash
# Build all images
docker-compose build

# Run specific service
docker-compose run tealtiger-typescript node
docker-compose run tealtiger-typescript-dev bash
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENAI_API_KEY` | OpenAI API key | For OpenAI |
| `ANTHROPIC_API_KEY` | Anthropic API key | For Anthropic |
| `GOOGLE_API_KEY` | Google Gemini API key | For Gemini |
| `AWS_ACCESS_KEY_ID` | AWS access key | For Bedrock |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key | For Bedrock |
| `COHERE_API_KEY` | Cohere API key | For Cohere |
| `MISTRAL_API_KEY` | Mistral API key | For Mistral |

## Security Best Practices

### Non-Root User

All images run as non-root user `tealtiger` (UID 1000) for security.

### Resource Limits

```bash
# Limit CPU and memory
docker run --rm \
  --cpus="0.5" \
  --memory="512m" \
  -e OPENAI_API_KEY=sk-xxx \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node my_script.js
```

### Read-Only Filesystem

```bash
# Run with read-only filesystem
docker run --rm \
  --read-only \
  --tmpfs /tmp:size=100M \
  -e OPENAI_API_KEY=sk-xxx \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node my_script.js
```

## Troubleshooting

### Image Pull Fails

```bash
# Try Docker Hub instead of GHCR
docker pull docker.io/tealtiger/typescript-sdk:latest
```

### Permission Denied

```bash
# Run as current user
docker run --rm \
  --user $(id -u):$(id -g) \
  -v $(pwd):/workspace \
  ghcr.io/tealtiger/typescript-sdk:latest \
  node my_script.js
```

### Module Not Found

```bash
# Verify installation
docker run --rm ghcr.io/tealtiger/typescript-sdk:latest \
  node -e "console.log(require('tealtiger'))"
```

## Support

- **Documentation:** https://github.com/agentguard-ai/tealtiger-typescript
- **Issues:** https://github.com/agentguard-ai/tealtiger-typescript/issues
- **Docker Hub:** https://hub.docker.com/r/tealtiger/typescript-sdk
- **GHCR:** https://github.com/orgs/tealtiger/packages

---

**Last Updated:** March 6, 2026  
**Version:** 1.0.0
