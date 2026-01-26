require('dotenv').config();
const mongoose = require('mongoose');

const password = "KXef0hAeb8CuvuL4"; // User approved password
const hosts = [
    "ac-ogmfdim-shard-00-00.ukevz26.mongodb.net",
    "ac-ogmfdim-shard-00-01.ukevz26.mongodb.net",
    "ac-ogmfdim-shard-00-02.ukevz26.mongodb.net"
];

async function findPrimary() {
    console.log("🔍 Scanning for Primary (Writable) Node...");

    for (const host of hosts) {
        const uri = `mongodb://gogohat12_db_user:${password}@${host}:27017/viral-shorts-db?ssl=true&authSource=admin&directConnection=true`;
        console.log(`\nTesting: ${host}...`);

        try {
            const conn = await mongoose.createConnection(uri, {
                serverSelectionTimeoutMS: 3000,
                connectTimeoutMS: 3000,
                family: 4
            }).asPromise();

            const admin = conn.db.admin();
            const status = await admin.command({ hello: 1 });

            console.log(`   - Connected!`);
            console.log(`   - isWritablePrimary: ${status.isWritablePrimary}`);
            console.log(`   - isSecondary: ${status.secondary}`);

            if (status.isWritablePrimary) {
                console.log(`\n🎉 FOUND PRIMARY: ${host}`);
                console.log(`\n>>> ACTION REQUIRED: Update .env with this host <<<`);
                await conn.close();
                process.exit(0);
            }

            await conn.close();

        } catch (err) {
            console.log(`   - Connection Failed: ${err.message}`);
        }
    }

    console.log("\n❌ Could not find a Primary node. All nodes strictly secondary or unreachable.");
    process.exit(1);
}

findPrimary();
