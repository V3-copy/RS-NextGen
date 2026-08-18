FROM node:20-bullseye-slim

WORKDIR /app

# Install PM2 globally
RUN npm install -g pm2

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Expose backend API port
EXPOSE 3001

# Start the application using pm2-runtime (keeps container alive)
CMD ["pm2-runtime", "start", "ecosystem.config.js"]
