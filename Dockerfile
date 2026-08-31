# Use the official Node.js 20 LTS image as base
FROM node:20-slim

ARG CLAUDE_CODE_VERSION=latest

# Install git + Python (for the ingestion pipeline: chunk_wiki.py, save_to_supabase.py)
RUN apt-get update && apt-get install -y \
  git \
  python3 \
  python3-pip \
  python3-venv \
  && rm -rf /var/lib/apt/lists/*

# Create a non-root user for safer execution
RUN useradd -m -u 1001 claudeuser

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Set working directory
WORKDIR /app

# Switch to non-root user
USER claudeuser

# Create a Python virtual environment for the ingestion scripts
# (avoids PEP 668 "externally managed environment" restriction on Debian's system Python)
RUN python3 -m venv /home/claudeuser/venv
ENV PATH="/home/claudeuser/venv/bin:$PATH"

# Pre-install Python deps for the ingestion pipeline
# (add/adjust based on scripts/requirements.txt as it evolves)
RUN pip install --no-cache-dir \
  supabase \
  requests \
  wikipedia-api

# Set the default command to start an interactive session
CMD ["claude"]
