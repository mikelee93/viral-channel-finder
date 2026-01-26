// Check for data array (actual Apify response structure)
if (first.data && Array.isArray(first.data)) {
    transcriptText = first.data.map(s => s.text || '').join(' ');
}
// Fallback: check for transcript array
else if (Array.isArray(first.transcript)) {
    transcriptText = first.transcript.map(s => s.text || '').join(' ');
}
// Fallback: check for string formats  
else if (typeof first.transcript === 'string') {
    transcriptText = first.transcript;
} else if (typeof first.text === 'string') {
    transcriptText = first.text;
}
