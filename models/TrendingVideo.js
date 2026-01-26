const mongoose = require('mongoose');

const TrendingVideoSchema = new mongoose.Schema({
    videoId: { type: String, required: true, unique: true, index: true },
    title: String,
    channelId: String,
    channelTitle: String,
    thumbnail: String,
    viewCount: Number,
    likeCount: Number,
    commentCount: Number,
    publishedAt: Date,
    categoryId: String,
    categoryName: String,
    tags: [String],
    duration: String,
    description: String,
    snapshot: { type: Date, default: Date.now, index: true }
});

module.exports = mongoose.model('TrendingVideo', TrendingVideoSchema);
