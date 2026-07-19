FROM node:20-alpine

WORKDIR /app

# docker-cli lets the app restart the comfyui container when
# /var/run/docker.sock is mounted (see docker-compose.yml)
RUN apk add --no-cache docker-cli

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy app source
COPY . .

# Expose port
EXPOSE 3001

# Environment variables for shared tokens (recommended for multi-user)
# OPENAI_API_KEY=sk-...
# GEMINI_API_KEY=...
# XAI_API_KEY=...
# COMFYUI_URL=http://comfyui:8188
# COMFYUI_RESTART_CMD=docker restart comfyui

CMD ["node", "server.js"]
