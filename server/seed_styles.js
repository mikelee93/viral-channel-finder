const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const HotChannel = require('../models/HotChannel'); // Adjusted to root models

async function seed() {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/viral_finder';
    console.log('Connecting to:', uri);

    try {
        await mongoose.connect(uri);
        console.log('Connected to DB');

        const sample = {
            channelId: "SAMPLE_MRBEAST",
            channelTitle: "MrBeast (Style Sample)",
            thumbnail: "https://yt3.googleusercontent.com/ytc/AIdro_kA8p_1s-0a0a0a0a0a0a0a0a=s176-c-k-c0x00ffffff-no-rj",
            categoryName: "Entertainment",
            subscriberCount: 240000000,
            videoCount: 800,
            viewCount: 40000000000,
            country: 'US',
            avgViewsPerVideo: 50000000,
            aiAnalysis: {
                analyzedAt: new Date(),
                summary: "High energy, philanthropy, grand challenges.",
                strategy: {
                    persona: "Hyper-Philanthropist",
                    tone: "Excited, Fast-paced, Loud",
                    hook_structure: "State the prize money immediately + Explosion",
                    pacing: "Rapid cuts every 2 seconds",
                    vocabulary: ["Million dollars", "Challenge", "Crazy", "Insane"],
                    narrative_arc: "Hook -> Rules -> Escalation -> Twist -> Emotional Payoff",
                    editing_notes: "Zoom ins, fast text overlays, sound effects on every movement"
                }
            }
        };

        const result = await HotChannel.findOneAndUpdate(
            { channelId: sample.channelId },
            sample,
            { upsert: true, new: true }
        );

        console.log('✅ Seeded sample style:', result.channelTitle);

    } catch (e) {
        console.error('Seed Error:', e);
    } finally {
        await mongoose.disconnect();
    }
}

seed();
