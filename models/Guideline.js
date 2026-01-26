const mongoose = require('mongoose');

const GuidelineSchema = new mongoose.Schema({
    category: {
        type: String,
        required: true,
        enum: ['community', 'monetization', 'copyright', 'shorts', 'general']
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    examples: [String],
    keywords: [String],
    severity: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium'
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    source: String, // YouTube 공식 URL
    isActive: {
        type: Boolean,
        default: true
    }
});

// 검색용 인덱스
GuidelineSchema.index({ category: 1, keywords: 1 });
GuidelineSchema.index({ title: 'text', description: 'text' });

module.exports = mongoose.model('Guideline', GuidelineSchema);
