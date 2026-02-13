/**
 * Reddit API Routes
 *
 * Description: Reddit viral video finder and comments fetcher
 */

const express = require('express');

const router = express.Router();

/**
 * GET /api/reddit/viral
 * Fetch viral video posts from Reddit (subreddit or global search)
 *
 * Query params:
 * - subreddit: string - Subreddit name or search query (default: 'all')
 * - sort: string - Sort method: hot, top, new, rising (default: 'hot')
 * - limit: number - Number of posts to fetch (default: 25)
 * - time: string - Time filter: hour, day, week, month, year, all (default: 'day')
 * - mode: string - 'subreddit' or 'search' (default: 'subreddit')
 *
 * Response:
 * - success: boolean
 * - data: { posts: Array } - Array of Reddit video posts
 */
router.get('/viral', async (req, res) => {
    try {
        const { subreddit = 'all', sort = 'hot', limit = 25, time = 'day', mode = 'subreddit' } = req.query;
        console.log(`[Reddit API] ${mode === 'search' ? 'Searching' : 'Fetching r/'}${subreddit} (${sort}, ${time})`);

        let redditUrl;
        if (mode === 'search') {
            // Global Search - Optimized for Media (Video/Images) to mimic "Media" tab
            // We append domain filters to the query to ensure we get video content
            const mediaQuery = `${subreddit} (site:v.redd.it OR site:youtube.com OR site:youtu.be OR site:tiktok.com OR site:instagram.com OR site:facebook.com OR site:streamable.com OR site:twitter.com OR site:x.com)`;
            redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(mediaQuery)}&sort=${sort}&limit=${limit}&t=${time}&type=link&include_over_18=on`;
        } else {
            // Subreddit Browse
            redditUrl = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${limit}&t=${time}&include_over_18=on`;
        }

        const response = await fetch(redditUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        if (!response.ok) {
            throw new Error(`Reddit API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!data || !data.data || !data.data.children) {
            throw new Error('Invalid Reddit API response format');
        }

        // Filter valid video posts
        const posts = data.data.children
            .map(child => child.data)
            .filter(post => {
                // Must be video or have rich media or be a known social video link
                return post.is_video ||
                    post.url.includes('youtu') ||
                    post.url.includes('v.redd.it') ||
                    post.domain === 'v.redd.it' ||
                    post.url.includes('tiktok.com') ||
                    post.url.includes('instagram.com') ||
                    post.url.includes('facebook.com') ||
                    post.url.includes('streamable.com') ||
                    post.url.includes('twitter.com') ||
                    post.url.includes('x.com');
            })
            .map(post => ({
                id: post.id,
                title: post.title,
                subreddit: post.subreddit_name_prefixed,
                author: post.author,
                score: post.score,
                comments: post.num_comments,
                url: post.url,
                permalink: `https://www.reddit.com${post.permalink}`,
                thumbnail: (post.thumbnail && post.thumbnail.startsWith('http')) ? post.thumbnail : null,
                created_utc: post.created_utc,
                is_video: post.is_video,
                video_url: post.secure_media?.reddit_video?.fallback_url || post.url,
                hls_url: post.secure_media?.reddit_video?.hls_url // HLS stream for audio support
            }));

        // Success response (standard format)
        return res.json({
            success: true,
            data: { posts }
        });

    } catch (error) {
        console.error('[Reddit Viral Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch Reddit data'
        });
    }
});

/**
 * GET /api/reddit/comments
 * Fetch comments from a Reddit post
 *
 * Query params:
 * - url: string - Reddit post URL (required)
 *
 * Response:
 * - success: boolean
 * - data: { post: Object, comments: Array } - Post info and flattened comments
 */
router.get('/comments', async (req, res) => {
    try {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({
                success: false,
                error: 'URL parameter is required'
            });
        }

        console.log(`[Reddit Comments] Fetching comments for: ${url}`);

        // Extract post ID from Reddit URL
        // Supports: https://www.reddit.com/r/subreddit/comments/POST_ID/...
        //           https://v.redd.it/POST_ID
        let postUrl = url;

        // If it's a v.redd.it URL, resolve it to the full reddit.com URL
        if (url.includes('v.redd.it')) {
            try {
                // Use GET instead of HEAD as some servers block HEAD or handle it differently
                const response = await fetch(url, {
                    method: 'GET',
                    redirect: 'follow', // Follow redirects
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
                    }
                });

                if (response.url && response.url.includes('reddit.com/r/')) {
                    console.log(`[Reddit Comments] Resolved v.redd.it to: ${response.url}`);
                    postUrl = response.url;
                } else {
                    console.warn(`[Reddit Comments] Could not resolve v.redd.it to a post URL. final URL: ${response.url}`);
                    return res.status(400).json({
                        success: false,
                        error: 'Cannot resolve v.redd.it link to a Reddit post. Please use the full Reddit post URL (e.g., https://www.reddit.com/r/...).'
                    });
                }
            } catch (e) {
                console.warn(`[Reddit Comments] Error resolving v.redd.it: ${e.message}`);
                return res.status(400).json({
                    success: false,
                    error: `Error resolving video URL: ${e.message}. Please use the full Reddit post URL.`
                });
            }
        }

        // Ensure URL ends with .json
        if (!postUrl.endsWith('.json')) {
            postUrl = postUrl.replace(/\/$/, '') + '.json';
        }

        const response = await fetch(postUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive'
            }
        });

        if (!response.ok) {
            throw new Error(`Reddit API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();

        if (!Array.isArray(data) || data.length < 2) {
            throw new Error('Invalid Reddit comments response format');
        }

        // data[0] = post info, data[1] = comments
        const postData = data[0].data.children[0].data;
        const commentsData = data[1].data.children;

        // Recursive function to flatten nested comments
        function flattenComments(commentNode, depth = 0) {
            const comments = [];

            if (commentNode.kind === 't1') { // t1 = comment
                const comment = commentNode.data;

                // Skip deleted/removed comments
                if (comment.body && comment.body !== '[deleted]' && comment.body !== '[removed]') {
                    comments.push({
                        author: comment.author,
                        text: comment.body,
                        score: comment.score,
                        created_utc: comment.created_utc,
                        depth: depth
                    });
                }

                // Recursively process replies
                if (comment.replies && comment.replies.data && comment.replies.data.children) {
                    comment.replies.data.children.forEach(reply => {
                        comments.push(...flattenComments(reply, depth + 1));
                    });
                }
            }

            return comments;
        }

        // Flatten all comments
        const allComments = [];
        commentsData.forEach(commentNode => {
            allComments.push(...flattenComments(commentNode));
        });

        console.log(`[Reddit Comments] Fetched ${allComments.length} comments`);

        // Success response (standard format)
        return res.json({
            success: true,
            data: {
                post: {
                    title: postData.title,
                    author: postData.author,
                    subreddit: postData.subreddit_name_prefixed,
                    score: postData.score,
                    num_comments: postData.num_comments,
                    url: postData.url,
                    permalink: `https://www.reddit.com${postData.permalink}`
                },
                comments: allComments
            }
        });

    } catch (error) {
        console.error('[Reddit Comments Error]', error);
        return res.status(500).json({
            success: false,
            error: error.message || 'Failed to fetch Reddit comments'
        });
    }
});

module.exports = router;
