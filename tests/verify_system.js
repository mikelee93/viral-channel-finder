const http = require('http');

function makeRequest(path, method = 'GET', body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 4000,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, data: data }));
        });

        req.on('error', e => reject(e));

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log('🔍 Starting System Verification...\n');

    // 1. Verify Categories API
    try {
        console.log('1️⃣ Testing Categories API (/api/hot-channels/categories)...');
        const res = await makeRequest('/api/hot-channels/categories');
        const json = JSON.parse(res.data);

        if (json.success && json.categories) {
            console.log(`   ✅ Success! Found ${json.categories.length} categories.`);
            if (json.categories.length > 0) {
                console.log(`   Sample: ${json.categories[0].name} (${json.categories[0].count} channels)`);
            }
        } else {
            console.log('   ❌ Failed. Invalid response format.');
        }
    } catch (e) {
        console.log(`   ❌ Connection Failed: ${e.message}`);
    }

    // 2. Verify Search API & Thumbnails
    try {
        console.log('\n2️⃣ Testing Search API & Thumbnails (/api/hot-channels)...');
        const payload = {
            growthMetric: 'total_views',
            contentType: 'shorts'
        };
        const res = await makeRequest('/api/hot-channels', 'POST', payload);
        const json = JSON.parse(res.data);

        if (json.channels && json.channels.length > 0) {
            console.log(`   ✅ Success! Found ${json.channels.length} channels.`);

            // Check Thumbnails
            const sampleChannel = json.channels[0];
            const thumb = sampleChannel.thumbnail;
            console.log(`   🖼️  Thumbnail URL Check: ${thumb}`);

            if (thumb && !thumb.includes('via.placeholder.com')) {
                console.log('   ✅ Thumbnail looks good (Not placeholder).');
            } else {
                console.log('   ⚠️  Thumbnail is still placeholder or missing.');
            }

            // Check Category Field
            console.log(`   📂 Category: ${sampleChannel.category}`);

        } else {
            console.log('   ⚠️  No channels found (might need to run discovery first).');
        }

    } catch (e) {
        console.log(`   ❌ Connection Failed: ${e.message}`);
    }

    console.log('\n🏁 Verification Complete.');
}

runTests();
