#!/usr/bin/env python3

import os
import sys
import subprocess
import whisper
from pathlib import Path
import logging

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

class VideoProcessor:
    def __init__(self):
        self.video_dir = Path('video')
        self.audio_dir = Path('audio')
        self.frames_dir = Path('frames')
        self.transcripts_dir = Path('transcripts')
        self.supported_formats = {'.mp4', '.mov', '.avi', '.mkv', '.ts', '.m2ts'}
        
        # Create output directories
        for directory in [self.audio_dir, self.frames_dir, self.transcripts_dir]:
            directory.mkdir(exist_ok=True)

    def extract_audio(self, video_path: Path) -> Path:
        """Extract audio from video file."""
        try:
            output_path = self.audio_dir / f"{video_path.stem}.mp3"
            logger.info(f"Extracting audio from {video_path.name}...")
            
            command = [
                'ffmpeg', '-y',
                '-i', str(video_path),
                '-vn',                # Disable video
                '-ac', '1',          # Mono audio
                '-ar', '44100',      # Sample rate
                '-q:a', '0',         # Highest quality
                str(output_path)
            ]
            
            # Run ffmpeg command
            result = subprocess.run(
                command,
                capture_output=True,
                text=True
            )
            
            if result.returncode == 0:
                logger.info(f"Successfully extracted audio to {output_path}")
                return output_path
            else:
                logger.error(f"Failed to extract audio: {result.stderr}")
                return None
                
        except Exception as e:
            logger.error(f"Error extracting audio: {str(e)}")
            return None

    def extract_frames(self, video_path: Path) -> bool:
        """Extract frames every 60 seconds from video."""
        try:
            # Create output directory for this video's frames
            output_dir = self.frames_dir / video_path.stem
            output_dir.mkdir(exist_ok=True)
            
            # Get video duration using ffprobe
            duration_cmd = [
                'ffprobe',
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                str(video_path)
            ]
            
            duration = float(subprocess.check_output(duration_cmd).decode().strip())
            
            # Extract a frame every 60 seconds
            for second in range(0, int(duration), 60):
                output_path = output_dir / f"{video_path.stem}-{second}s.jpg"
                
                command = [
                    'ffmpeg', '-y',
                    '-ss', str(second),
                    '-i', str(video_path),
                    '-vframes', '1',
                    '-q:v', '2',
                    str(output_path)
                ]
                
                subprocess.run(command, capture_output=True)
                logger.info(f"Extracted frame at {second}s from {video_path.name}")
                
            return True
            
        except Exception as e:
            logger.error(f"Error extracting frames: {str(e)}")
            return False

    def transcribe_audio(self, audio_path: Path) -> bool:
        """Transcribe audio file using Whisper."""
        try:
            logger.info(f"Loading Whisper model...")
            model = whisper.load_model("base")
            
            logger.info(f"Transcribing {audio_path.name}...")
            result = model.transcribe(str(audio_path))
            
            # Save transcription
            output_path = self.transcripts_dir / f"{audio_path.stem}.txt"
            with open(output_path, 'w', encoding='utf-8') as f:
                f.write(result["text"])
                
            logger.info(f"Transcription saved to {output_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error during transcription: {str(e)}")
            return False

    def process_videos(self):
        """Process all videos in the video directory."""
        if not self.video_dir.exists():
            logger.error("Video directory not found")
            return

        # Get all video files
        video_files = [
            f for f in self.video_dir.iterdir()
            if f.suffix.lower() in self.supported_formats
        ]

        if not video_files:
            logger.info("No video files found in the video directory")
            return

        stats = {
            'processed': 0,
            'audio_extracted': 0,
            'frames_extracted': 0,
            'transcribed': 0
        }

        for video_path in video_files:
            logger.info(f"\nProcessing {video_path.name}...")
            stats['processed'] += 1

            # Extract audio
            audio_path = self.extract_audio(video_path)
            if audio_path:
                stats['audio_extracted'] += 1
                
                # Transcribe audio
                if self.transcribe_audio(audio_path):
                    stats['transcribed'] += 1

            # Extract frames
            if self.extract_frames(video_path):
                stats['frames_extracted'] += 1

        # Print summary
        logger.info("\nProcessing complete!")
        logger.info(f"Processed {stats['processed']} videos")
        logger.info(f"Successfully extracted audio from {stats['audio_extracted']} videos")
        logger.info(f"Successfully extracted frames from {stats['frames_extracted']} videos")
        logger.info(f"Successfully transcribed {stats['transcribed']} videos")

def main():
    try:
        processor = VideoProcessor()
        processor.process_videos()
    except KeyboardInterrupt:
        logger.info("\nProcess interrupted by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    main()