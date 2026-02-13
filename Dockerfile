# Stage 1: Build the Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
# Copy frontend package.json
COPY frontend/package*.json ./
RUN npm install
# Copy frontend source
COPY frontend/ .
# Build frontend
RUN npm run build

# Stage 2: Build the Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
# Copy backend package.json
COPY backend/package*.json ./
RUN npm install
# Copy backend source
COPY backend/ .
# Build backend (TypeScript)
RUN npm run build

# Stage 3: Production Image
FROM node:20-alpine
WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

# Copy Backend production dependencies
COPY backend/package*.json ./
RUN npm install --production

# Copy Backend build
COPY --from=backend-builder /app/backend/dist ./dist

# Copy Frontend build to 'public' folder in Backend structure
# The code in index.ts expects '../public' relative to 'dist/index.js'
COPY --from=frontend-builder /app/frontend/dist ./public

# Copy Prisma schema and generate client
COPY backend/prisma ./prisma
RUN npx prisma generate

# Expose port
EXPOSE 3001

# Start the server
CMD ["node", "dist/index.js"]
