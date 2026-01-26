const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');
const SHEET_ID_FILE = path.join(__dirname, 'spreadsheet_id.txt'); // Optional: Store sheet ID here or env

class GoogleSheetsService {
    constructor() {
        this.auth = null;
        this.sheets = null;

        // Try to read spreadsheet ID from env OR file
        this.spreadsheetId = process.env.SPREADSHEET_ID || null;

        if (!this.spreadsheetId && fs.existsSync(SHEET_ID_FILE)) {
            try {
                this.spreadsheetId = fs.readFileSync(SHEET_ID_FILE, 'utf8').trim();
                console.log('[SheetsService] Loaded SPREADSHEET_ID from file.');
            } catch (e) {
                console.warn('[SheetsService] Failed to read spreadsheet_id.txt:', e);
            }
        }

        this.init();
    }

    async init() {
        try {
            if (fs.existsSync(CREDENTIALS_PATH)) {
                const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
                const credentials = JSON.parse(content);

                // Check if credentials are filled (simple check)
                if (!credentials.project_id || credentials.project_id.includes('REPLACE_WITH')) {
                    console.warn('[SheetsService] credentials.json exists but appears to be a template.');
                    return;
                }

                this.auth = new google.auth.GoogleAuth({
                    keyFile: CREDENTIALS_PATH,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });

                this.sheets = google.sheets({ version: 'v4', auth: this.auth });
                console.log('[SheetsService] Initialized successfully.');
            } else {
                console.warn('[SheetsService] credentials.json not found.');
            }
        } catch (error) {
            console.error('[SheetsService] Initialization failed:', error);
        }
    }

    async appendRow(data) {
        if (!this.sheets || !this.spreadsheetId) {
            console.warn('[SheetsService] Sheets client not ready or SPREADSHEET_ID missing.');
            return false;
        }

        try {
            // Data structure: [Title, Views, VerifyDate, ViralScore, HookType, StructureType, EmotionTarget, AnalysisSummary]
            const values = [
                [
                    data.title,
                    data.viewCount,
                    new Date().toISOString().split('T')[0],
                    data.viralScore,
                    data.viralPoint?.hook || 'N/A',
                    data.viralPoint?.structure || 'N/A',
                    data.viralPoint?.emotion || 'N/A',
                    data.viralPoint?.summary || 'N/A'
                ]
            ];

            const resource = { values };

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Sheet1!A1', // Appends to the end of Sheet1
                valueInputOption: 'USER_ENTERED',
                resource,
            });

            console.log('[SheetsService] Data appended to Sheet.');
            return true;
        } catch (error) {
            console.error('[SheetsService] Failed to append data:', error);
            return false;
        }
    }

    /**
     * Google Sheets에서 최근 바이럴 영상 데이터 읽기
     * @param {number} limit - 가져올 개수 (기본 10개)
     * @returns {Promise<Array>} 바이럴 영상 패턴 배열
     */
    async getRecentViral(limit = 10) {
        if (!this.sheets || !this.spreadsheetId) {
            console.warn('[SheetsService] Sheets client not ready or SPREADSHEET_ID missing.');
            return [];
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Sheet1!A2:H', // 헤더 제외, A부터 H열까지
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                console.log('[SheetsService] No viral data found in sheet.');
                return [];
            }

            // 데이터 파싱 및 정렬 (Score 높은 순)
            const viralData = rows
                .map(row => ({
                    title: row[0] || '',
                    viewCount: row[1] || '0',
                    date: row[2] || '',
                    score: parseInt(row[3]) || 0,
                    hook: row[4] || '',
                    structure: row[5] || '',
                    emotion: row[6] || '',
                    summary: row[7] || ''
                }))
                .filter(item => item.score > 0) // Score 있는 것만
                .sort((a, b) => b.score - a.score) // 높은 점수 우선
                .slice(0, limit); // 상위 N개

            console.log(`[SheetsService] Loaded ${viralData.length} viral patterns.`);
            return viralData;

        } catch (error) {
            console.error('[SheetsService] Failed to read viral data:', error);
            return [];
        }
    }

    /**
     * Script Library에 대본 추가
     * @param {Object} scriptData - { videoId, title, channelName, category, transcript, memo, views }
     * @returns {Promise<boolean>}
     */
    async appendScript(scriptData) {
        if (!this.sheets || !this.spreadsheetId) {
            console.warn('[SheetsService] Sheets client not ready or SPREADSHEET_ID missing.');
            return false;
        }

        try {
            const values = [[
                scriptData.videoId || '',
                scriptData.title || '',
                scriptData.channelName || '',
                scriptData.category || '일반',
                scriptData.transcript || '',
                scriptData.memo || '',
                new Date().toISOString().split('T')[0], // addedDate
                scriptData.views || 0
            ]];

            const resource = { values };

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Script Library!A1', // "Script Library" 시트에 추가
                valueInputOption: 'USER_ENTERED',
                resource,
            });

            console.log('[SheetsService] Script added to library:', scriptData.title);
            return true;
        } catch (error) {
            console.error('[SheetsService] Failed to append script:', error);
            return false;
        }
    }

    /**
     * Script Library에서 카테고리별 대본 가져오기
     * @param {string} category - 카테고리 (optional, 없으면 전체)
     * @param {number} limit - 가져올 개수 (기본 5개)
     * @returns {Promise<Array>} 대본 배열
     */
    async getScriptsByCategory(category = null, limit = 5) {
        if (!this.sheets || !this.spreadsheetId) {
            console.warn('[SheetsService] Sheets client not ready or SPREADSHEET_ID missing.');
            return [];
        }

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Script Library!A2:H', // 헤더 제외
            });

            const rows = response.data.values;
            if (!rows || rows.length === 0) {
                console.log('[SheetsService] No scripts found in library.');
                return [];
            }

            // 데이터 파싱
            let scripts = rows.map(row => ({
                videoId: row[0] || '',
                title: row[1] || '',
                channelName: row[2] || '',
                category: row[3] || '',
                transcript: row[4] || '',
                memo: row[5] || '',
                addedDate: row[6] || '',
                views: row[7] || '0'
            }));

            // 카테고리 필터링
            if (category) {
                scripts = scripts.filter(s => s.category === category);
            }

            // 랜덤하게 섞어서 limit 개수만큼 반환
            const shuffled = scripts.sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, limit);

            console.log(`[SheetsService] Loaded ${selected.length} scripts (category: ${category || 'all'}).`);
            return selected;

        } catch (error) {
            console.error('[SheetsService] Failed to read scripts:', error);
            return [];
        }
    }
    /**
     * HOT Channel 발굴 결과를 시트에 동기화
     * @param {Array} channels - 발굴된 채널 리스트
     * @param {string} categoryName - 카테고리명
     * @returns {Promise<boolean>}
     */
    async syncHotChannels(channels, categoryName) {
        if (!this.sheets || !this.spreadsheetId) {
            console.warn('[SheetsService] Sheets client not ready or SPREADSHEET_ID missing.');
            return false;
        }

        try {
            const date = new Date().toISOString().split('T')[0];
            const values = channels.map(ch => [
                date,
                categoryName,
                ch.name || ch.channelTitle,
                `https://www.youtube.com/channel/${ch.channelId}`,
                ch.subscribers || ch.subscriberCount || 0,
                ch.totalViews || ch.viewCount || 0,
                ch.avgViewsPerVideo || 0,
                ch.dailyGrowth || 0,
                ch.hotScore || 0
            ]);

            if (values.length === 0) return true;

            const resource = { values };

            // "Daily Hot Channels" 시트에 추가 (없으면 생성해야 함 - 여기서는 있다고 가정하거나 에러 처리)
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Daily Hot Channels!A1',
                valueInputOption: 'USER_ENTERED',
                resource,
            });

            console.log(`[SheetsService] Synced ${values.length} hot channels for ${categoryName}.`);
            return true;
        } catch (error) {
            console.error('[SheetsService] Failed to sync hot channels:', error);
            // 시트가 없어서 에러가 날 경우 처리 (옵션)
            if (error.message.includes('Unable to parse range')) {
                console.warn('[SheetsService] "Daily Hot Channels" sheet might be missing. Please create it.');
            }
            return false;
        }
    }
}

module.exports = new GoogleSheetsService();
