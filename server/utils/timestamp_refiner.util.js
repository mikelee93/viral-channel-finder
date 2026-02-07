/**
 * Timestamp Refiner Utility
 * Matches target text against transcript segments to correct timestamps.
 * Useful when AI hallucinates timestamps but gets the text right.
 */

function refineTimestampsUsingTranscript(plan, transcriptSegments) {
    if (!plan || !transcriptSegments || transcriptSegments.length === 0) return plan;

    console.log('[Timestamp Refiner] Starting refinement scan...');

    return plan.map(scene => {
        // Only refine if we have original transcript text to search for
        if (!scene.original_transcript || scene.original_transcript.length < 5) return scene;

        // Normalize target text (remove punctuation, lower case)
        const targetText = normalizeText(scene.original_transcript);

        let bestMatch = null;
        let bestScore = 0;

        // Sliding window search over segments
        // We assume the AI text might span multiple segments (e.g. 1-3 segments)
        const maxSegmentsToSpan = 8;

        for (let i = 0; i < transcriptSegments.length; i++) {
            let accumulatedText = "";
            let start = transcriptSegments[i].start;

            for (let j = 0; j < maxSegmentsToSpan && (i + j) < transcriptSegments.length; j++) {
                const seg = transcriptSegments[i + j];
                // Try matching against original text or korean text or whatever is available
                // Usually we match against `text`
                const segText = normalizeText(seg.text || seg.textKo || "");

                if (j > 0) accumulatedText += " "; // Add space between segments
                accumulatedText += segText;

                const end = seg.end;

                // Calculate similarity
                const similarity = calculateSimilarity(targetText, accumulatedText);

                if (similarity > bestScore) {
                    bestScore = similarity;
                    bestMatch = { start, end, text: accumulatedText };
                }
            }
        }

        // Threshold: 0.6 (60% match)
        if (bestScore > 0.6 && bestMatch) {
            // Check drift
            const driftStart = Math.abs(bestMatch.start - scene.start);
            const driftEnd = Math.abs(bestMatch.end - scene.end);

            if (driftStart > 1.0 || driftEnd > 1.0) { // Only update if drift represents > 1s error
                console.log(`[Timestamp Refinement] Corrected "${scene.stage}" timestamps (Score: ${bestScore.toFixed(2)})`);
                console.log(`   Text:     "${scene.original_transcript.substring(0, 30)}..." matches "${bestMatch.text.substring(0, 30)}..."`);
                console.log(`   Time:     ${scene.start.toFixed(2)}-${scene.end.toFixed(2)} => ${bestMatch.start.toFixed(2)}-${bestMatch.end.toFixed(2)}`);

                // Return updated scene
                return {
                    ...scene,
                    start: bestMatch.start,
                    end: bestMatch.end
                };
            }
        }

        return scene;
    });
}

function normalizeText(str) {
    if (!str) return "";
    return str.toLowerCase().replace(/[^a-z0-9\u3131-\uD79D\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, "");
}

function calculateSimilarity(s1, s2) {
    if (!s1 || !s2) return 0.0;

    // Check if one contains the other
    if (s1.includes(s2) || s2.includes(s1)) {
        const longer = Math.max(s1.length, s2.length);
        const shorter = Math.min(s1.length, s2.length);
        if (shorter < longer * 0.4) return 0.5; // Weak match if very short
        return 0.95; // Strong match
    }

    const distance = levenshteinDistance(s1, s2);
    const longerLength = Math.max(s1.length, s2.length);
    if (longerLength === 0) return 1.0;

    return (longerLength - distance) / longerLength;
}

function levenshteinDistance(s1, s2) {
    // Standard Levenshtein implementation
    if (s1.length === 0) return s2.length;
    if (s2.length === 0) return s1.length;

    const matrix = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(0));

    for (let i = 0; i <= s1.length; i++) {
        matrix[0][i] = i;
    }
    for (let j = 0; j <= s2.length; j++) {
        matrix[j][0] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= s2.length; i++) {
        for (let j = 1; j <= s1.length; j++) {
            if (s2.charAt(i - 1) == s1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[s2.length][s1.length];
}

module.exports = { refineTimestampsUsingTranscript };
