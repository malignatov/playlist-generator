# Small + fast Node runtime
FROM node:20-alpine

# Create workdir
WORKDIR /app

# Copy backend manifest first for better layer caching
COPY backend/package*.json ./backend/

# Install only production deps
RUN cd backend && npm ci --omit=dev

# Copy source
COPY backend/src ./backend/src
COPY backend/src/data ./backend/src/data
COPY frontend ./frontend

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose internal port
EXPOSE 3000

# Start the same Express server you already use (it serves the frontend too)
CMD ["node", "backend/src/server.js"]