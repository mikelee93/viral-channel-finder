const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const { promisify } = require('util');
const unlink = promisify(fs.unlink);

// Configure multer for video uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = /mp4|mov|avi|mkv|webm/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (extname && mimetype) {
            cb(null, true);
        } else {
            cb(new Error('영상 파일만 업로드 가능합니다 (mp4, mov, avi, mkv, webm)'));
        }
    }
});

/**
 * POST /api/guidelines/cut-highlights
 * 
 * Body: {
 *   highlights: [{ start: 10.5, end: 20.3 }, { start: 45.2, end: 60.8 }, ...]
 * }
 * 
 * File: Multipart form-data with 'video' field
 * 
 * Returns: Merged video file for download
 */
router.post('/cut-highlights', upload.single('video'), async (req, res) => {
    let tempFiles = [];

    try {
        if (!req.file) {
            return res.status(400).json({ error: '영상 파일이 필요합니다' });
        }

        const { highlights } = req.body;

        if (!highlights || !Array.isArray(JSON.parse(highlights))) {
            return res.status(400).json({ error: '하이라이트 구간 정보가 필요합니다' });
        }

        const highlightsArray = JSON.parse(highlights);

        if (highlightsArray.length === 0) {
            return res.status(400).json({ error: '최소 1개 이상의 하이라이트가 필요합니다' });
        }

        const videoPath = req.file.path;
        tempFiles.push(videoPath);

        const outputDir = path.join(__dirname, '../../outputs');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        console.log(`[Highlight Cutter] Processing ${highlightsArray.length} highlights from: ${req.file.originalname}`);

        // Step 1: Cut individual segments
        const segmentPaths = [];

        for (let i = 0; i < highlightsArray.length; i++) {
            const highlight = highlightsArray[i];
            const { start, end } = highlight;

            if (typeof start !== 'number' || typeof end !== 'number' || start >= end) {
                throw new Error(`잘못된 하이라이트 구간: ${i + 1}번째 (${start} - ${end})`);
            }

            const duration = end - start;
            const segmentPath = path.join(outputDir, `segment_${Date.now()}_${i}.mp4`);
            segmentPaths.push(segmentPath);
            tempFiles.push(segmentPath);

            console.log(`[Highlight Cutter] Cutting segment ${i + 1}/${highlightsArray.length}: ${start}s - ${end}s (${duration.toFixed(1)}s)`);

            await new Promise((resolve, reject) => {
                ffmpeg(videoPath)
                    .setStartTime(start)
                    .setDuration(duration)
                    .output(segmentPath)
                    .videoCodec('libx264')
                    .audioCodec('aac')
                    .outputOptions([
                        '-preset fast',
                        '-crf 23',
                        '-movflags +faststart'
                    ])
                    .on('end', () => {
                        console.log(`[Highlight Cutter] ✅ Segment ${i + 1} complete`);
                        resolve();
                    })
                    .on('error', (err) => {
                        console.error(`[Highlight Cutter] ❌ Error cutting segment ${i + 1}:`, err.message);
                        reject(new Error(`영상 구간 자르기 실패 (${i + 1}번째): ${err.message}`));
                    })
                    .run();
            });
        }

        // Step 2: Merge all segments using concat demuxer (more reliable)
        const finalOutputPath = path.join(outputDir, `highlights_merged_${Date.now()}.mp4`);
        tempFiles.push(finalOutputPath);

        console.log(`[Highlight Cutter] Merging ${segmentPaths.length} segments...`);

        // Create a concat list file for FFmpeg
        const concatListPath = path.join(outputDir, `concat_list_${Date.now()}.txt`);
        const concatListContent = segmentPaths
            .map(p => `file '${p.replace(/\\/g, '/')}'`)
            .join('\n');

        fs.writeFileSync(concatListPath, concatListContent, 'utf8');
        tempFiles.push(concatListPath);

        console.log(`[Highlight Cutter] Concat list created with ${segmentPaths.length} files`);

        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(concatListPath)
                .inputOptions(['-f', 'concat', '-safe', '0'])
                .videoCodec('libx264')
                .audioCodec('aac')
                .outputOptions([
                    '-preset fast',
                    '-crf 23',
                    '-movflags +faststart'
                ])
                .output(finalOutputPath)
                .on('start', (commandLine) => {
                    console.log('[Highlight Cutter] FFmpeg command:', commandLine);
                })
                .on('end', () => {
                    console.log('[Highlight Cutter] ✅ Merge complete');
                    resolve();
                })
                .on('error', (err) => {
                    console.error('[Highlight Cutter] ❌ Merge error:', err.message);
                    reject(new Error(`영상 병합 실패: ${err.message}`));
                })
                .run();
        });

        // Step 3: Send file for download
        const filename = `highlights_${Date.now()}.mp4`;

        res.download(finalOutputPath, filename, async (err) => {
            // Cleanup temp files after download
            for (const tempFile of tempFiles) {
                try {
                    if (fs.existsSync(tempFile)) {
                        await unlink(tempFile);
                        console.log(`[Cleanup] Deleted: ${path.basename(tempFile)}`);
                    }
                } catch (cleanupErr) {
                    console.error(`[Cleanup Error] ${path.basename(tempFile)}:`, cleanupErr.message);
                }
            }

            if (err) {
                console.error('[Download Error]:', err.message);
            } else {
                console.log('[Highlight Cutter] ✅ File sent successfully');
            }
        });

    } catch (error) {
        console.error('[Highlight Cutter Error]:', error);

        // Cleanup on error
        for (const tempFile of tempFiles) {
            try {
                if (fs.existsSync(tempFile)) {
                    await unlink(tempFile);
                }
            } catch (cleanupErr) {
                // Ignore cleanup errors
            }
        }

        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
