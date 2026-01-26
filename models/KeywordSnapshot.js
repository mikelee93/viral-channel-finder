const mongoose = require('mongoose');

const KeywordSnapshotSchema = new mongoose.Schema({
    // 카테고리 정보
    categoryId: {
        type: String,
        required: true,
        index: true
    },
    categoryName: {
        type: String,
        required: true
    },

    // 수집 시점
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },

    // 키워드 데이터
    keywords: [{
        text: {
            type: String,
            required: true
        },
        frequency: {
            type: Number,
            required: true
        },
        totalViews: {
            type: Number,
            default: 0
        },
        videoCount: {
            type: Number,
            default: 0
        },
        avgEngagement: {
            type: Number,
            default: 0
        },
        topVideos: [String],  // Video IDs

        // 다국어 번역
        translations: {
            ko: String,
            en: String,
            ja: String
        }
    }],

    // 메타데이터
    collectionMethod: {
        type: String,
        enum: ['search_api', 'trending_api', 'manual'],
        default: 'search_api'
    },
    apiQuotaUsed: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true  // createdAt, updatedAt 자동 생성
});

// 복합 인덱스 (빠른 조회를 위해)
KeywordSnapshotSchema.index({ categoryId: 1, timestamp: -1 });

module.exports = mongoose.model('KeywordSnapshot', KeywordSnapshotSchema);
