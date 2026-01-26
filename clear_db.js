require('dotenv').config();
const mongoose = require('mongoose');
const HotChannel = require('./models/HotChannel');

async function clearChannels() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const result = await HotChannel.deleteMany({});
        console.log(`Deleted ${result.deletedCount} channels from DB.`);

        await mongoose.disconnect();
        console.log('Disconnected');
    } catch (error) {
        console.error('Error clearing channels:', error);
    }
}

clearChannels();
