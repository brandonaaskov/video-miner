const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }
}

async function extractAudio(videoPath, audioDir) {
    return new Promise((resolve, reject) => {
        const filename = path.basename(videoPath, path.extname(videoPath));
        const audioOutput = path.join(audioDir, `${filename}.mp3`);
        
        console.log(`Extracting audio from ${filename}...`);
        
        const ffmpeg = spawn('ffmpeg', [
            '-y',
            '-i', videoPath,
            '-vn',
            '-ac', '1',
            '-ar', '44100',
            '-q:a', '0',
            audioOutput
        ]);

        let lastProgress = 0;
        let noProgressTimer = null;
        
        ffmpeg.stderr.on('data', (data) => {
            const output = data.toString();
            if (output.includes('size=')) {
                lastProgress = Date.now();
                if (noProgressTimer) {
                    clearTimeout(noProgressTimer);
                }
                noProgressTimer = setTimeout(() => {
                    console.log('No progress detected for 30 seconds, terminating process...');
                    ffmpeg.kill();
                    reject(new Error('Process timed out due to no progress'));
                }, 30000);
            }
        });

        ffmpeg.on('error', (error) => {
            if (noProgressTimer) clearTimeout(noProgressTimer);
            reject(error);
        });

        ffmpeg.on('close', (code) => {
            if (noProgressTimer) clearTimeout(noProgressTimer);
            
            if (code === 0) {
                console.log(`Successfully extracted audio to ${audioOutput}`);
                resolve(audioOutput);
            } else {
                reject(new Error(`ffmpeg process exited with code ${code}`));
            }
        });

        // Global timeout of 10 minutes
        setTimeout(() => {
            ffmpeg.kill();
            reject(new Error('Process timed out after 10 minutes'));
        }, 600000);
    });
}

async function findPythonCommand() {
    const commands = ['python3', 'python', 'py'];
    
    for (const cmd of commands) {
        try {
            await execAsync(`${cmd} --version`);
            return cmd;
        } catch (error) {
            continue;
        }
    }
    throw new Error('No Python installation found. Please install Python 3 and make sure it\'s in your PATH.');
}

async function transcribeAudio(audioPath, transcriptsDir) {
    return new Promise(async (resolve, reject) => {
        try {
            const pythonCommand = await findPythonCommand();
            const filename = path.basename(audioPath, path.extname(audioPath));
            const outputPath = path.join(transcriptsDir, `${filename}.txt`);
            
            console.log(`Transcribing ${filename}...`);
            console.log('Using Python command:', pythonCommand);
            
            const pythonScript = `
import sys
print("Starting Python script...")
try:
    print("Importing whisper...")
    import whisper
    print("Whisper imported successfully")
    
    print("Loading whisper model...")
    model = whisper.load_model("base")
    print("Model loaded successfully")
    
    print(f"Starting transcription of: {sys.argv[1]}")
    result = model.transcribe(sys.argv[1])
    print("Transcription complete")
    
    print("Writing output file...")
    with open(sys.argv[2], "w", encoding="utf-8") as f:
        f.write(result["text"])
    print("Output file written successfully")
    
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;

            const tempScriptPath = path.join(__dirname, 'temp_whisper_script.py');
            console.log('Creating temporary Python script...');
            fs.writeFileSync(tempScriptPath, pythonScript);
            console.log('Temporary script created at:', tempScriptPath);

            console.log('Launching Python process...');
            const pythonProcess = spawn(pythonCommand, [
                tempScriptPath,
                audioPath.replace(/\\/g, '/'),
                outputPath.replace(/\\/g, '/')
            ]);

            let stdoutData = '';
            let stderrData = '';

            pythonProcess.stdout.on('data', (data) => {
                const output = data.toString();
                stdoutData += output;
                console.log(`Whisper: ${output.trim()}`);
            });

            pythonProcess.stderr.on('data', (data) => {
                const error = data.toString();
                stderrData += error;
                console.error(`Whisper Error: ${error.trim()}`);
            });

            pythonProcess.on('error', (error) => {
                console.error(`Failed to start Python process: ${error.message}`);
                fs.unlinkSync(tempScriptPath);
                reject(error);
            });

            // Add a timeout of 30 minutes for the entire process
            const timeout = setTimeout(() => {
                console.log('Transcription timed out after 30 minutes');
                pythonProcess.kill();
                reject(new Error('Transcription timed out'));
            }, 30 * 60 * 1000);

            pythonProcess.on('close', (code) => {
                clearTimeout(timeout);
                try {
                    fs.unlinkSync(tempScriptPath);
                } catch (error) {
                    console.error('Error cleaning up temporary script:', error.message);
                }

                if (code === 0) {
                    console.log(`Successfully transcribed ${filename}`);
                    resolve(outputPath);
                } else {
                    let errorMessage = `Transcription failed with code ${code}`;
                    if (stderrData) {
                        errorMessage += `\nError details: ${stderrData}`;
                    }
                    if (stdoutData) {
                        errorMessage += `\nOutput: ${stdoutData}`;
                    }
                    reject(new Error(errorMessage));
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function processVideos() {
    const videoDir = path.join(__dirname, 'video');
    const audioDir = path.join(__dirname, 'audio');
    const transcriptsDir = path.join(__dirname, 'transcripts');
    
    try {
        if (!fs.existsSync(videoDir)) {
            console.error('Video directory not found');
            return;
        }

        await ensureDirectoryExists(audioDir);
        await ensureDirectoryExists(transcriptsDir);

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
            audioExtracted: 0,
            transcribed: 0,
            failed: 0
        };

        for (const file of videoFiles) {
            const videoPath = path.join(videoDir, file);
            console.log(`\nProcessing ${file}...`);
            
            stats.processed++;
            
            const audioPath = await extractAudio(videoPath, audioDir);
            if (!audioPath) {
                stats.failed++;
                continue;
            }
            stats.audioExtracted++;

            try {
                await transcribeAudio(audioPath, transcriptsDir);
                stats.transcribed++;
            } catch (error) {
                console.error(`Error transcribing ${file}:`, error.message);
                stats.failed++;
            }
        }

        console.log('\nProcessing complete!');
        console.log(`Processed ${stats.processed} videos`);
        console.log(`Successfully extracted audio from ${stats.audioExtracted} videos`);
        console.log(`Successfully transcribed ${stats.transcribed} videos`);
        console.log(`Failed operations: ${stats.failed}`);
        
        console.log('\nOutputs:');
        console.log('- Audio files are in the "audio" directory');
        console.log('- Transcripts are in the "transcripts" directory');
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the script
processVideos();