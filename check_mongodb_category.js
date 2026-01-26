const mongoose = require('mongoose');
const HotChannel = require('./models/HotChannel');

// Connect to MongoDB
mongoose.connect('mongodb://gogohat12_db_user:KXef0hAeb8CuvuL4@ac-ogmfdim-shard-00-02.ukevz26.mongodb.net:27017/viral-shorts-db?ssl=true&authSource=admin&directConnection=true')
    .then(() => checkData())
    .catch(err => console.error('DB Connection Error:', err));

async function checkData() {
    try {
        console.log('Checking MongoDB for categorized data...');

        // Check for Film & Animation channels
        const filmChannels = await HotChannel.find({ categoryName: 'Film & Animation' }).limit(5);

        if (filmChannels.length > 0) {
            console.log(`\n✅ Found ${filmChannels.length} channels in "Film & Animation":`);
            filmChannels.forEach(ch => {
                console.log(`- [${ch.channelTitle}] (Score: ${ch.hotScore})`);
            });
        } else {
            console.log('\n❌ No channels found for "Film & Animation" yet. (Cron might be running or failed)');
        }

        const count = await HotChannel.countDocuments();
        console.log(`\nTotal Channels in DB: ${count}`);

    } catch (error) {
        console.error('Error:', error);
    } finally {
        mongoose.disconnect();
    }
}
