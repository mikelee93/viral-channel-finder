const mongoose = require('mongoose');

const HotChannelSchema = new mongoose.Schema({
    channelId: { type: String, required: true, unique: true, index: true },
    channelTitle: String,
    channelHandle: String,
    thumbnail: String,
    subscriberCount: Number,
    videoCount: Number,
    viewCount: Number,
    categoryId: String,
    categoryName: String,
    country: { type: String, index: true }, // Added country field
    recentVideos: [{
        videoId: String,
        title: String,
        thumbnail: String,
        viewCount: Number,
        publishedAt: Date
    }],
    avgViewsPerVideo: Number,
    estimatedRevenue: String,
    lastUpdated: { type: Date, default: Date.now, index: true },
    aiAnalysis: {
        strategy: mongoose.Schema.Types.Mixed, // Stores JSON strategy: persona, tone, structure
        summary: String,
        analyzedAt: Date
    }
});

module.exports = mongoose.model('HotChannel', HotChannelSchema);
