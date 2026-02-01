const axios = require('axios');

const targets = [
    { url: 'https://www.youtube.com/@1%E5%88%86%E5%8B%95%E7%94%BB/shorts', category: 'entertainment', name: '1分動画' },
    { url: 'https://www.youtube.com/@kpop_tv/shorts', category: 'music', name: 'KPOP TV' },
    { url: 'https://www.youtube.com/@%E4%B8%80%E5%88%86%E4%B8%80%E7%A7%92/shorts', category: 'entertainment', name: '一分一秒' },
    { url: 'https://www.youtube.com/@%E4%B8%80%E5%88%86%E3%82%AA%E3%82%BF%E3%82%AF/shorts', category: 'film_animation', name: '一分オタク' }
];

async function runBatch() {
    console.log('Starting batch analysis...');

    for (const target of targets) {
        console.log(`\n-----------------------------------`);
        console.log(`Analyzing: ${target.name} (${target.category})`);
        console.log(`URL: ${target.url}`);

        try {
            const response = await axios.post('http://localhost:4000/api/channels/analyze', {
                url: target.url,
                category: target.category
            }, {
                timeout: 300000 // 5 minutes timeout per channel
            });

            if (response.data.success) {
                console.log(`[SUCCESS] Analysis Complete for ${target.name}`);
                console.log('Summary:', response.data.analysis.summary);
            } else {
                console.log(`[FAILED] ${target.name}:`, response.data);
            }
        } catch (error) {
            console.error(`[ERROR] ${target.name}:`, error.message);
            if (error.response) {
                console.error('Response data:', error.response.data);
            }
        }

        // Wait a bit between requests to be safe
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    console.log('\nBatch processing finished.');
}

runBatch();
