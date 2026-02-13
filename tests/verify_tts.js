
const fetch = require('node-fetch');
const fs = require('fs');

async function testTTS() {
    try {
        console.log("Testing TTS endpoint...");
        const response = await fetch('http://127.0.0.1:5001/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: '안녕하세요, 테스트입니다.',
                prompt: 'Natural speech'
            })
        });

        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }

        const buffer = await response.arrayBuffer();
        console.log(`Success! Received ${buffer.byteLength} bytes.`);
        fs.writeFileSync('test_output.mp3', Buffer.from(buffer));
        console.log("Saved to test_output.mp3");

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testTTS();
