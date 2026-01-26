const fetch = require('node-fetch');

async function quickTest() {
    const PORT = 4005; // Temporary testing port
    const VIDEO_ID = '2auhOe53DZ4'; // The video with captions

    console.log(`Quick test: /api/get-transcript for ${VIDEO_ID} on port ${PORT}...`);
    console.log('Starting request...');

    const startTime = Date.now();

    try {
        const response = await fetch(`http://localhost:${PORT}/api/get-transcript`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: VIDEO_ID })
        });

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\nResponse received in ${elapsed}s`);
        console.log(`Status: ${response.status}`);

        const data = await response.json();

        if (response.ok) {
            console.log('\n✅ SUCCESS!');
            console.log(`Source: ${data.source}`);
            console.log(`Transcript length: ${data.transcript?.length || 0} characters`);
            if (data.transcript) {
                console.log(`Preview: ${data.transcript.substring(0, 200)}...`);
            }
        } else {
            console.log('\n❌ FAILED!');
            console.log(JSON.stringify(data, null, 2));
        }

    } catch (e) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`\n❌ ERROR after ${elapsed}s:`);
        console.error(e.message);
    }
}

quickTest();
