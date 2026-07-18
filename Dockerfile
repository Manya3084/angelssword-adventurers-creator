FROM node:20-alpine

WORKDIR /app

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

CMD ["node", "server.js"]