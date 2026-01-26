const https = require('https');
const fs = require('fs');
const path = require('path');

const SPEAKER_DIRECTORY_MAP = {
    '044830d2-f23b-44d6-ac0d-b5d733caa900': 'No7_044830d2-f23b-44d6-ac0d-b5d733caa900',
    '0ebe2c7d-96f3-4f0e-a2e3-ae13fe27c403': 'Voidoll_0ebe2c7d-96f3-4f0e-a2e3-ae13fe27c403',
    '67d5d8da-acd7-4207-bb10-b5542d3a663b': 'WhiteCUL_67d5d8da-acd7-4207-bb10-b5542d3a663b',
    'dda44ade-5f9c-4a3a-9d2c-2a976c7476d9': 'あいえるたん_dda44ade-5f9c-4a3a-9d2c-2a976c7476d9',
    '3be49e15-34bb-48a0-9e2f-9b80c96e9905': 'あん코몽_3be49e15-34bb-48a0-9e2f-9b80c96e9905',
    '388f246b-8c41-4ac1-8e2d-5d79f3ff56d9': 'ずんだもん_388f246b-8c41-4ac1-8e2d-5d79f3ff56d9',
    '0156da66-4300-474a-a398-49eb2e8dd853': 'ぞん子_0156da66-4300-474a-a398-49eb2e8dd853',
    '468b8e94-9da4-4f7a-8715-a22a48844f9e': 'ちび式じい_468b8e94-9da4-4f7a-8715-a22a48844f9e',
    '9f3ee141-26ad-437e-97bd-d22298d02ad2': 'もち子さん_9f3ee141-26ad-437e-97bd-d22298d02ad2',
    '882a636f-3bac-431a-966d-c5e6bba9f949': 'ナースロボタイプＴ_882a636f-3bac-431a-966d-c5e6bba9f949',
    '462cd6b4-c088-42b0-b357-3816e24f112e': 'ユー레이ちゃん_462cd6b4-c088-42b0-b357-3816e24f112e',
    '1f18ffc3-47ea-4ce0-9829-0576d03a7ec8': '中国うさぎ_1f18ffc3-47ea-4ce0-9829-0576d03a7ec8',
    '4614a7de-9829-465d-9791-97eb8a5f9b86': '中部つるぎ_4614a7de-9829-465d-9791-97eb8a5f9b86',
    '481fb609-6446-4870-9f46-90c4dd623403': '九州そら_481fb609-6446-4870-9f46-90c4dd623403',
    '8eaad775-3119-417e-8cf4-2a10bfd592c8': '冥鳴ひまり_8eaad775-3119-417e-8cf4-2a10bfd592c8',
    '1a17ca16-7ee5-4ea5-b191-2f02ace24d21': '剣崎雌雄_1a17ca16-7ee5-4ea5-b191-2f02ace24d21',
    '7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff': '四国めたん_7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff',
    'a8cc6d22-aad0-4ab8-bf1e-2f843924164a': '小夜SAYO_a8cc6d22-aad0-4ab8-bf1e-2f843924164a',
    '0f56c2f2-644c-49c9-8989-94e11f7129d0': '後鬼_0f56c2f2-644c-49c9-8989-94e11f7129d0',
    '35b2c544-660e-401e-b503-0e14c635303a': '春日부츠무기_35b2c544-660e-401e-b503-0e14c635303a',
    'ba5d2428-f7e0-4c20-ac41-9dd56e9178b4': '春歌ナナ_ba5d2428-f7e0-4c20-ac41-9dd56e9178b4',
    '1bd6b32b-d650-4072-bbe5-1d0ef4aaa28b': '東北きりたん_1bd6b32b-d650-4072-bbe5-1d0ef4aaa28b',
    '80802b2d-8c75-4429-978b-515105017010': '東北ずん子_80802b2d-8c75-4429-978b-515105017010',
    'ab4c31a3-8769-422a-b412-708f5ae637e8': '東北イタコ_ab4c31a3-8769-422a-b412-708f5ae637e8',
    '04dbd989-32d0-40b4-9e71-17c920f2a8a9': '栗田마론_04dbd989-32d0-40b4-9e71-17c920f2a8a9',
    '0693554c-338e-4790-8982-b9c6d476dc69': '櫻歌미코_0693554c-338e-4790-8982-b9c6d476dc69',
    'b1a81618-b27b-40d2-b0ea-27a9ad408c4b': '波音리츠_b1a81618-b27b-40d2-b0ea-27a9ad408c4b',
    '287aa49f-e56b-4530-a469-855776c84a8d': '만베츠하나마루_287aa49f-e56b-4530-a469-855776c84a8d',
    '00a5c10c-d3bd-459f-83fd-43180b521a44': '猫使アル_00a5c10c-d3bd-459f-83fd-43180b521a44',
    'c20a2254-0349-4470-9fc8-e5c0f8cf3404': '猫使ビィ_c20a2254-0349-4470-9fc8-e5c0f8cf3404',
    'c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f': '玄野武宏_c30dc15a-0992-4f8d-8bb8-ad3b314e6a6f',
    '97a4af4b-086e-4efd-b125-7ae2da85e697': '琴詠니아_97a4af4b-086e-4efd-b125-7ae2da85e697',
    'e5020595-5c5d-4e87-b849-270a518d0dcf': '白上虎太郎_e5020595-5c5d-4e87-b849-270a518d0dcf',
    '471e39d2-fb11-4c8c-8d89-4b322d2498e0': '聖騎士紅桜_471e39d2-fb11-4c8c-8d89-4b322d2498e0',
    '0acebdee-a4a5-4e12-a695-e19609728e30': '雀松쥬지_0acebdee-a4a5-4e12-a695-e19609728e30',
    '3b91e034-e028-4acb-a08d-fbdcd207ea63': '離途_3b91e034-e028-4acb-a08d-fbdcd207ea63',
    '3474ee95-c274-47f9-aa1a-8322163d96f1': '雨晴하우_3474ee95-c274-47f9-aa1a-8322163d96f1',
    '4f51116a-d9ee-4516-925d-21f183e2afad': '青山龍星_4f51116a-d9ee-4516-925d-21f183e2afad',
    '7d1e7ba7-f957-40e5-a3fc-da49f769ab65': '麒ヶ島宗麟_7d1e7ba7-f957-40e5-a3fc-da49f769ab65',
    '0b466290-f9b6-4718-8d37-6c0c81e824ac': '黒沢冴白_0b466290-f9b6-4718-8d37-6c0c81e824ac'
};

const outputDir = path.join(__dirname, 'public', 'voicevox-icons');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

async function downloadIcon(uuid, githubDir) {
    const url = `https://raw.githubusercontent.com/VOICEVOX/voicevox_resource/main/character_info/${encodeURIComponent(githubDir)}/icon.png`;
    const targetPath = path.join(outputDir, `${uuid}.png`);

    return new Promise((resolve) => {
        const fetch = (fetchUrl) => {
            https.get(fetchUrl, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    return fetch(res.headers.location);
                }
                if (res.statusCode !== 200) {
                    console.error(`Failed to download ${uuid}: Status ${res.statusCode}`);
                    return resolve(false);
                }
                const file = fs.createWriteStream(targetPath);
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    console.log(`Downloaded: ${uuid}.png`);
                    resolve(true);
                });
            }).on('error', (err) => {
                console.error(`Error downloading ${uuid}: ${err.message}`);
                resolve(false);
            });
        };
        fetch(url);
    });
}

async function downloadAll() {
    console.log('Starting icon download...');
    const entries = Object.entries(SPEAKER_DIRECTORY_MAP);
    for (const [uuid, dir] of entries) {
        await downloadIcon(uuid, dir);
        // Add small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
    }
    console.log('Finished downloading icons.');
}

downloadAll();
