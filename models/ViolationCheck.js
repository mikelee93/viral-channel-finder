const mongoose = require('mongoose');

const ViolationCheckSchema = new mongoose.Schema({
    // Video info
    videoUrl: String,
    videoId: String,
    videoFile: String, // 업로드된 파일 경로
    title: {
        type: String,
        required: true
    },
    description: String,

    // Analysis results
    analysis: {
        overallStatus: {
            type: String,
            enum: ['safe', 'warning', 'danger'],
            required: true
        },
        score: {
            type: Number,
            min: 0,
            max: 100,
            required: true
        },
        violations: [{
            timestamp: String, // "00:15" 형식
            category: String,
            severity: {
                type: String,
                enum: ['low', 'medium', 'high', 'critical']
            },
            issue: String,
            recommendation: String,
            guidelineRef: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Guideline'
            }
        }],
        summary: String
    },

    // Metadata
    checkedAt: {
        type: Date,
        default: Date.now
    },
    checkedBy: String, // 사용자 ID (추후 구현)

    // Video metadata
    duration: Number,
    frameCount: Number,
    transcript: String
});

// 인덱스
ViolationCheckSchema.index({ videoId: 1 });
ViolationCheckSchema.index({ 'analysis.overallStatus': 1 });
ViolationCheckSchema.index({ checkedAt: -1 });

module.exports = mongoose.model('ViolationCheck', ViolationCheckSchema);
