# Use Alpine Linux with Node.js 22 (latest LTS)
FROM node:22-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@10.13.1

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
# Install dependencies
RUN pnpm install --frozen-lockfile --prod

# Build stage
FROM base AS builder

# Install all dependencies (including dev dependencies)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN pnpm build

# Production stage
FROM node:22-alpine AS production

# Install pnpm
RUN npm install -g pnpm@10.13.1

# Create app user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install only production dependencies
RUN pnpm install --frozen-lockfile --prod && \
    pnpm store prune

# Copy built application from builder stage
COPY --from=builder /app/build ./build

# Copy database directory (if it exists)
COPY --from=builder /app/data ./data

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh

# Install su-exec for user switching in entrypoint
RUN apk add --no-cache su-exec

# Make entrypoint executable and create data directory
RUN chmod +x /entrypoint.sh && \
    mkdir -p /app/data && \
    chown -R nodejs:nodejs /app

# Don't switch to nodejs user here - let entrypoint handle it

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["node", "build/main.js"]
