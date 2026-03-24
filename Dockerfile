# Stage 1: Build dependencies and compile code
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Install dependencies required for Prisma and native extensions
# Security: Use specific openssl version, alpine provides latest by default
RUN apk add --no-cache openssl

# Copy package files only (security: explicit, not entire context)
COPY package.json package-lock.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Security: Copy only necessary source files, not entire context
# This prevents accidental inclusion of .env, .git, node_modules, etc.
COPY src ./src
COPY tsconfig*.json ./
COPY nest-cli.json ./

# Build the NestJS application
RUN npm run build


# Stage 2: Production dependencies
FROM node:20-alpine AS deps

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
# Install ONLY production dependencies to keep image small
RUN npm ci --omit=dev

# Copy generated Prisma client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma


# Stage 3: Production final image
FROM node:20-alpine AS runner

# Create a non-root user for security
# NestJS best practice
RUN addgroup -S nodegroup && adduser -S nodeuser -G nodegroup && \
    apk add --no-cache openssl

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy Prisma schema (required for some Prisma ops like migrate if needed, though usually run separately)
COPY --from=builder /app/prisma ./prisma

# Set ownership and restrict permissions for security
RUN chown -R nodeuser:nodegroup ./dist ./node_modules ./prisma \
    && chmod -R 550 ./dist ./prisma \
    && chmod -R 555 ./node_modules

# Change to non-root user
USER nodeuser

# Expose port (can be overridden by docker-compose)
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]
