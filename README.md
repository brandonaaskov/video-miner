# Video Miner

I created this so that I could quickly find a portion of a video that I'm looking for. Sometimes that information is in the captions (if provided), sometimes it's in the audio, and sometimes you just need to see some screenshots to refresh your memory.

You provide a directory of videos, and inside this script will create:
- /frames: screen grabs every 60s in a dedicated folder for each video
- /audio: the audio files extracted from the video as an mp3
- /captions: extracted captions (if available)
- /transcripts: the audio file transcribed

```
docker build -t video-miner .
./process-videos.sh /path/to/your/videos/folder/
```

That's it! You'll see feedback in your terminal as it processes, and you'll find the files in those subdirectories as it goes.

## Tech Under the Hood
This uses python3 and ffmpeg to extract everything, and it uses OpenAI's Whisper model to do the audio transcription. This will use GPU acceleration if you're running this on a machine that has an NVIDIA GPU.