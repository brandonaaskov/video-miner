const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Utility Functions
async function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

async function getVideoDuration(videoPath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
        );
        return parseFloat(stdout);
    } catch (error) {
        console.error(`Error getting duration for ${videoPath}:`, error.message);
        return null;
    }
}

// Frame Extraction Functions
async function extractFrames(videoPath, framesDir) {
    try {
        const duration = await getVideoDuration(videoPath);
        if (!duration) return;

        const filename = path.basename(videoPath, path.extname(videoPath));
        const outputDir = path.join(framesDir, filename);
        await ensureDirectoryExists(outputDir);

        // Extract a frame every 60 seconds
        for (let second = 0; second < duration; second += 60) {
            const outputPath = path.join(outputDir, `${filename}-${second}s.jpg`);
            const command = `ffmpeg -ss ${second} -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}"`;
            
            await execAsync(command);
            console.log(`Extracted frame at ${second}s from ${filename}`);
        }
        return true;
    } catch (error) {
        console.error(`Error processing ${videoPath}:`, error.message);
        return false;
    }
}

// Caption Extraction Functions
async function analyzeVideoSubtitles(videoPath) {
    try {
        const { stdout } = await execAsync(
            `ffprobe -v error -select_streams s -show_entries stream=index,codec_name:stream_tags=language,title -of json "${videoPath}"`
        );
        
        const result = JSON.parse(stdout);
        return result.streams || [];
    } catch (error) {
        console.error(`Error analyzing ${videoPath}:`, error.message);
        return [];
    }
}

async function extractCaptions(videoPath, captionsDir) {
    try {
        const filename = path.basename(videoPath, path.extname(videoPath));
        const subtitleStreams = await analyzeVideoSubtitles(videoPath);

        let foundCaptions = false;

        if (subtitleStreams.length === 0) {
            console.log(`No subtitle streams found in ${filename}`);
            
            // Try extracting CEA-608/708 captions
            try {
                const ceaOutput = path.join(captionsDir, `${filename}-cea608.srt`);
                await execAsync(`ffmpeg -i "${videoPath}" -map 0:c:s -f srt -t 10 "${ceaOutput}"`);
                // Check if the file is empty or very small (likely just headers)
                const stats = fs.statSync(ceaOutput);
                if (stats.size > 100) {
                    console.log(`Extracted CEA-608/708 captions from ${filename}`);
                    foundCaptions = true;
                } else {
                    fs.unlinkSync(ceaOutput); // Remove empty or near-empty file
                    console.log(`No CEA-608/708 captions found in ${filename}`);
                }
            } catch (ceaError) {
                console.error(`Error extracting CEA captions from ${filename}:`, ceaError.message);
            }
        }

        // Extract each subtitle stream
        for (const stream of subtitleStreams) {
            const streamIndex = stream.index;
            const language = stream.tags?.language || 'und';
            const title = stream.tags?.title || '';
            const codec = stream.codec_name || 'unknown';
            
            const outputName = `${filename}-${language}${title ? '-' + title : ''}-${codec}`;
            const srtOutput = path.join(captionsDir, `${outputName}.srt`);
            
            try {
                // Try to extract to SRT format with timeout and forced output
                await execAsync(`ffmpeg -y -i "${videoPath}" -map 0:${streamIndex} -c:s srt -f srt "${srtOutput}"`, { timeout: 30000 });
                // Verify the output file exists and has content
                const stats = fs.statSync(srtOutput);
                if (stats.size > 100) {
                    console.log(`Extracted ${language} subtitles from ${filename} (${codec})`);
                    foundCaptions = true;
                } else {
                    fs.unlinkSync(srtOutput); // Remove empty or near-empty file
                    throw new Error('Output file was empty');
                }
            } catch (error) {
                console.error(`Error extracting subtitles from stream ${streamIndex}:`, error.message);
                
                // If SRT conversion fails, try extracting in original format
                const originalOutput = path.join(captionsDir, `${outputName}.${codec}`);
                try {
                    await execAsync(
                        `ffmpeg -i "${videoPath}" -map 0:${streamIndex} -c copy "${originalOutput}"`
                    );
                    console.log(`Extracted ${language} subtitles in original ${codec} format`);
                    foundCaptions = true;
                } catch (origError) {
                    console.error(`Error extracting original format:`, origError.message);
                }
            }
        }

        return foundCaptions;
    } catch (error) {
        console.error(`Error processing ${videoPath}:`, error.message);
        return false;
    }
}

// Main Processing Function
async function processVideos() {
    const videoDir = path.join(__dirname, 'video');
    const framesDir = path.join(__dirname, 'frames');
    const captionsDir = path.join(__dirname, 'captions');
    
    try {
        // Check if video directory exists
        if (!fs.existsSync(videoDir)) {
            console.error('Video directory not found');
            return;
        }

        // Create output directories
        await ensureDirectoryExists(framesDir);
        await ensureDirectoryExists(captionsDir);

        // Get all video files
        const files = fs.readdirSync(videoDir);
        const videoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.mp4', '.mov', '.avi', '.mkv', '.ts', '.m2ts'].includes(ext);
        });

        if (videoFiles.length === 0) {
            console.log('No video files found in the video directory');
            return;
        }

        let stats = {
            processed: 0,
            framesExtracted: 0,
            captionsFound: 0
        };

        // Process each video
        for (const file of videoFiles) {
            const videoPath = path.join(videoDir, file);
            console.log(`\nProcessing ${file}...`);
            
            // Extract frames
            // console.log('Extracting frames...');
            // const framesExtracted = await extractFrames(videoPath, framesDir);
            const framesExtracted = null
            
            // Extract captions
            console.log('Extracting captions...');
            const captionsExtracted = await extractCaptions(videoPath, captionsDir);
            
            stats.processed++;
            if (framesExtracted) stats.framesExtracted++;
            if (captionsExtracted) stats.captionsFound++;
        }

        // Print summary
        console.log('\nProcessing complete!');
        console.log(`Processed ${stats.processed} videos`);
        console.log(`Successfully extracted ${stats.framesExtracted} frames`);
        console.log(`Successfully extracted ${stats.captionsFound} captions`);
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the script
processVideos();