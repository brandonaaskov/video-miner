FROM nvidia/cuda:12.1.0-base-ubuntu22.04

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies with CUDA support
RUN pip3 install --no-cache-dir torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
RUN pip3 install --no-cache-dir openai-whisper

# Create app directory
WORKDIR /app

# Copy the script
COPY video-miner.py .

# Make the script executable
RUN chmod +x video-miner.py

ENTRYPOINT ["python3", "video-miner.py"]