#!/bin/bash

if [ -z "$1" ]; then
    echo "Usage: ./process-videos.sh /path/to/video/directory"
    exit 1
fi

# Check if nvidia-smi is available (GPU present)
if command -v nvidia-smi &> /dev/null; then
    echo "NVIDIA GPU detected, using GPU acceleration"
    GPU_FLAG="--gpus all"
else
    echo "No NVIDIA GPU detected, falling back to CPU"
    GPU_FLAG=""
fi

# Convert to absolute path
ABSOLUTE_PATH=$(realpath "$1")

# Run the docker container with auto-removal
docker run --rm $GPU_FLAG -v "$ABSOLUTE_PATH:/data" video-miner /data