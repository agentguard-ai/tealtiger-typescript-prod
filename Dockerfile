# TealTiger TypeScript SDK - Production Image
# Multi-stage build for minimal image size

# Stage 1: Builder
FROM node:20-alpine as builder

LABEL maintainer="TealTiger Team <support@tealtiger.co.in>"
LABEL description="TealTiger TypeScript SDK - AI agent security with guardrails and cost tracking"

WORKDIR /build

# Copy package files
COPY package*.json tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create tsconfig for Docker build (exclude CLI)
RUN echo '{"extends": "./tsconfig.json", "exclude": ["node_modules", "dist", "**/*.test.ts", "src/cli/**/*"]}' > tsconfig.docker.json

# Build TypeScript
RUN npx tsc -p tsconfig.docker.json

# Stage 2: Runtime
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built files from builder
COPY --from=builder /build/dist/ ./dist/

# Copy examples and documentation
COPY examples/ ./examples/
COPY README.md LICENSE ./

# Use existing node user for security
RUN chown -R node:node /app

USER node

# Set environment variables
ENV NODE_ENV=production

# Default command
CMD ["node"]
