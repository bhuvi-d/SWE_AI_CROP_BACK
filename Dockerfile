# Node.js backend Dockerfile
FROM node:18-slim

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

# Set environment variables (can be overridden by docker-compose or cloud env)
ENV PORT=3000
ENV NODE_ENV=production

# Start the application
CMD ["node", "server.js"]
