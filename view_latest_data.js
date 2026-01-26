require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

// Define minimal schema for reading
const KeywordSnapshotSchema = new mongoose.Schema({
    categoryName: String,
    timestamp: Date,
    keywords: [{ text: String, frequency: Number }]
}, { strict: false });

const KeywordSnapshot = mongoose.model('KeywordSnapshot', KeywordSnapshotSchema);

async function viewData() {
    try {
        console.log('🔌 Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, { family: 4 });

        console.log('✅ Connected! Fetching latest snapshots...\n');

        const snapshots = await KeywordSnapshot.find()
            .sort({ timestamp: -1 })
            .limit(5);

        if (snapshots.length === 0) {
            console.log('📭 No data found yet.');
        } else {
            snapshots.forEach((snap, i) => {
                console.log(`[Snapshot #${i + 1}]`);
                console.log(`📁 Category: ${snap.categoryName}`);
                console.log(`⏰ Time: ${snap.timestamp.toLocaleString()}`);
                console.log(`🔑 Top 5 Keywords: ${snap.keywords.slice(0, 5).map(k => `${k.text}(${k.frequency})`).join(', ')}`);
                console.log('-----------------------------------');
            });
        }

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        await mongoose.disconnect();
        process.exit();
    }
}

viewData();
