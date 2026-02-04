const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');

// Define Inline Schema/Model to avoid require issues and force strict: false
const HotChannelSchema = new mongoose.Schema({
    channelId: String,
    channelTitle: String,
    categoryName: String,
    aiAnalysis: Object
}, { strict: false, collection: 'hotchannels' }); // Ensure collection name matches

// Check if model exists
const HotChannel = mongoose.models.HotChannel || mongoose.model('HotChannel', HotChannelSchema);

async function run() {
    try {
        console.log('Connecting to DB...');
        // Fix: Remove directConnection=true to allow driver to find Primary
        const uri = process.env.MONGODB_URI.replace(/[?&]directConnection=true/, '');
        console.log('Fixed URI:', uri.replace(/:[^:@]+@/, ':***@')); // Log masked
        await mongoose.connect(uri);
        console.log('Connected!');

        const doc = {
            channelId: 'MRBEAST_SAMPLE',
            channelTitle: 'MrBeast (Sample)',
            thumbnail: "https://yt3.googleusercontent.com/ytc/AIdro_kA8p_1s-0a0a0a0a0a0a0a0a=s176-c-k-c0x00ffffff-no-rj",
            categoryName: 'Entertainment',
            subscriberCount: 240000000,
            aiAnalysis: {
                analyzedAt: new Date(),
                summary: 'High energy sample',
                strategy: {
                    persona: 'Hyper-Philanthropist',
                    tone: 'Excited',
                    keywords: ['Money', 'Challenge']
                }
            }
        };

        await HotChannel.updateOne(
            { channelId: 'MRBEAST_SAMPLE' },
            { $set: doc },
            { upsert: true }
        );
        console.log('✅ Seeded MrBeast Sample!');
    } catch (e) {
        console.error('Seed Error:', e);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected.');
        process.exit(0);
    }
}
run();
