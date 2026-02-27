const axios = require('axios');
const instagramGetUrl = require('instagram-url-direct');

const STATIC_COBALT_INSTANCES = [
    'https://api.kektube.com',
    'https://api.cobalt.liubquanti.click',
    'https://api.qwkuns.me',
    'https://co.eepy.today',
    'https://api.dl.woof.monster',
    'https://cobaltapi.cjs.nz',
    'https://cobaltapi.squair.xyz',
];

let dynamicInstances = null;
let dynamicInstancesFetchedAt = 0;
const CACHE_TTL = 10 * 60 * 1000;

async function fetchWorkingInstances() {
    const now = Date.now();
    if (dynamicInstances && (now - dynamicInstancesFetchedAt) < CACHE_TTL) return dynamicInstances;
    try {
        const r = await axios.get('https://cobalt.directory/api/working?type=api', {
            timeout: 3000, headers: { 'User-Agent': 'video-downloader/1.0' }
        });
        if (r.data && r.data.data) {
            const all = new Set();
            Object.values(r.data.data).forEach(u => { if (Array.isArray(u)) u.forEach(x => all.add(x)); });
            if (all.size > 0) { dynamicInstances = [...all]; dynamicInstancesFetchedAt = now; return dynamicInstances; }
        }
    } catch (e) { }
    return null;
}

async function validateVideoUrl(url) {
    try {
        const response = await axios.get(url, {
            responseType: 'stream',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                // Sadece ilk kısmı indirmek istediğimizi belirtiyoruz ama her sunucu uymayabilir
                'Range': 'bytes=0-4095'
            },
            validateStatus: (s) => s >= 200 && s < 400,
        });

        const chunks = [];
        let size = 0;

        await new Promise((resolve) => {
            const timeout = setTimeout(() => { response.data.destroy(); resolve(); }, 8000);
            response.data.on('data', (chunk) => {
                chunks.push(chunk);
                size += chunk.length;
                if (size >= 1024) {
                    clearTimeout(timeout);
                    response.data.destroy();
                    resolve();
                }
            });
            response.data.on('end', () => {
                clearTimeout(timeout);
                resolve();
            });
            response.data.on('error', (err) => {
                clearTimeout(timeout);
                resolve();
            });
        });

        if (chunks.length === 0) {
            console.log(`  [VALIDATE] Empty response - REJECTED`);
            return false;
        }

        const buf = Buffer.concat(chunks);
        const hex = buf.slice(0, 8).toString('hex');

        // MP4: ftyp
        if (hex.includes('66747970')) { console.log(`  [VALIDATE] Valid MP4 ✅`); return true; }
        // WebM
        if (hex.startsWith('1a45dfa3')) { console.log(`  [VALIDATE] Valid WebM ✅`); return true; }
        // MP3/audio
        if (hex.startsWith('494433') || hex.startsWith('fffb') || hex.startsWith('fff3')) { console.log(`  [VALIDATE] Valid audio ✅`); return true; }
        // OGG
        if (hex.startsWith('4f676753')) { console.log(`  [VALIDATE] Valid OGG ✅`); return true; }

        // Accept if we got substantial data (might be a different container)
        if (buf.length > 100) { console.log(`  [VALIDATE] Unknown format but has data (${buf.length}B) - accepting`); return true; }

        console.log(`  [VALIDATE] Unknown/empty (hex: ${hex}, ${buf.length}B) - REJECTED`);
        return false;
    } catch (e) {
        console.log(`  [VALIDATE] Error: ${e.message} - REJECTED`);
        return false;
    }
}

async function tryCobaltInstance(instance, url, format) {
    const apiUrl = instance.endsWith('/') ? instance : `${instance}/`;

    // Cobalt API v7 is strict. Don't send youtube specific parameters for twitter/instagram
    const payload = {
        url,
        filenameStyle: 'classic',
    };

    if (format === 'mp3') {
        payload.downloadMode = 'audio';
        payload.audioFormat = 'mp3';
        payload.audioBitrate = '128';
    } else {
        payload.downloadMode = 'auto';
        payload.videoQuality = '720';
        if (url.includes('youtube.com') || url.includes('youtu.be')) {
            payload.youtubeVideoCodec = 'h264';
        }
    }

    const r = await axios.post(apiUrl, payload, {
        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'video-downloader/1.0' },
        timeout: 10000
    });

    if (r && r.data) {
        const d = r.data;
        if ((d.status === 'tunnel' || d.status === 'redirect') && d.url) {
            return { url: d.url, filename: d.filename, status: d.status };
        }
        if (d.status === 'picker' && d.picker && d.picker.length > 0) {
            return { url: d.picker[0].url, filename: null, status: 'picker' };
        }
        if (d.status === 'stream' && d.url) {
            return { url: d.url, filename: null, status: 'stream' };
        }
    }
    throw new Error('No valid URL in response');
}

async function tryCobaltInstanceValidated(instance, url, format) {
    const result = await tryCobaltInstance(instance, url, format);
    console.log(`  [${instance}] Got ${result.status} URL, validating...`);

    const isValid = await validateVideoUrl(result.url);
    if (!isValid) {
        throw new Error('Video URL returned empty/invalid data');
    }
    return result;
}

async function downloadFromCobalt(url, format = 'auto') {
    const dynamicList = await fetchWorkingInstances();
    const batch1 = [...STATIC_COBALT_INSTANCES];
    const staticSet = new Set(STATIC_COBALT_INSTANCES);
    const batch2 = dynamicList ? dynamicList.filter(i => !staticSet.has(i)) : [];

    // Try each instance sequentially with validation
    for (const inst of batch1) {
        try {
            console.log(`[TRY] ${inst}`);
            const result = await tryCobaltInstanceValidated(inst, url, format);
            console.log(`[OK] ${inst}`);
            return result;
        } catch (e) {
            console.log(`[FAIL] ${inst}: ${e.message}`);
        }
    }

    for (const inst of batch2) {
        try {
            console.log(`[TRY-DYN] ${inst}`);
            const result = await tryCobaltInstanceValidated(inst, url, format);
            console.log(`[OK-DYN] ${inst}`);
            return result;
        } catch (e) {
            console.log(`[FAIL-DYN] ${inst}: ${e.message}`);
        }
    }

    return null;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { return res.status(405).json({ error: 'Method Not Allowed' }); }

    const { url, format } = req.body;
    if (!url) { return res.status(400).json({ error: 'URL gerekli' }); }

    console.log(`Processing: ${url} | ${format}`);
    let result = null;

    try {
        // Instagram: try dedicated library first
        if (url.includes('instagram.com')) {
            try {
                const r = await instagramGetUrl(url);
                if (r && r.url_list && r.url_list.length > 0) {
                    result = { url: r.url_list[0], filename: null, status: 'redirect' };
                }
            } catch (e) { console.error('IG library fail:', e.message); }
        }

        // Cobalt: try for all platforms (including Instagram fallback)
        if (!result) {
            result = await downloadFromCobalt(url, format);
        }

        // Fallback for YouTube: use ytdl-core to get direct CDN URL
        if (!result && (url.includes('youtube.com') || url.includes('youtu.be'))) {
            console.log('Cobalt failed for YouTube, falling back to ytdl-core CDN URL...');
            try {
                const ytdl = require('@distube/ytdl-core');
                const info = await ytdl.getInfo(url);

                let ytdlFormat = null;
                // Try multiple format selection strategies
                const strategies = [
                    () => ytdl.chooseFormat(info.formats, { filter: 'audioandvideo', quality: 'highestvideo' }),
                    () => ytdl.chooseFormat(info.formats, { filter: 'audioandvideo', quality: 'lowest' }),
                    () => info.formats.find(f => f.itag === 18), // 360p mp4 combined
                    () => info.formats.find(f => f.itag === 22), // 720p mp4 combined
                    () => info.formats.find(f => f.hasAudio && f.hasVideo && f.url),
                    () => info.formats.find(f => f.hasAudio && f.hasVideo),
                ];

                for (const strategy of strategies) {
                    try {
                        const candidate = strategy();
                        if (candidate && candidate.url) { ytdlFormat = candidate; break; }
                    } catch (e) { /* try next strategy */ }
                }

                if (ytdlFormat && ytdlFormat.url) {
                    console.log(`[YTDL-CORE FALLBACK] Got ${ytdlFormat.qualityLabel || 'unknown'} CDN URL`);
                    const cleanTitle = (info.videoDetails.title || 'youtube_video')
                        .replace(/[^\w\s-]/g, '').trim().substring(0, 50).replace(/\s+/g, '_');
                    result = {
                        url: ytdlFormat.url,
                        filename: `${cleanTitle}.mp4`,
                        status: 'redirect',
                        directCdn: true
                    };
                } else {
                    console.log('[YTDL-CORE] No format with direct URL found (decipher may have failed)');
                }
            } catch (e) {
                console.log('ytdl-core fallback error:', e.message.substring(0, 100));
            }
        }

        // Add Fallback for Twitter using fxtwitter API if Cobalt fails
        if (!result && (url.includes('twitter.com') || url.includes('x.com'))) {
            console.log('Cobalt failed for Twitter, falling back to fxtwitter API...');
            try {
                const match = url.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
                if (match) {
                    const [, username, statusId] = match;
                    const api = `https://api.fxtwitter.com/${username}/status/${statusId}`;
                    const r = await axios.get(api, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' } });

                    if (r.data && r.data.tweet && r.data.tweet.media) {
                        const media = r.data.tweet.media;
                        let videoUrl = null;

                        if (media.videos && media.videos.length > 0) {
                            videoUrl = media.videos[0].url;
                        } else if (media.all && media.all.length > 0) {
                            const v = media.all.find(m => m.type === 'video' || m.type === 'gif');
                            if (v) videoUrl = v.url;
                        }

                        if (videoUrl) {
                            console.log(`[FXTWITTER] Found video URL: ${videoUrl}`);
                            const author = r.data.tweet.author?.screen_name || 'twitter_user';
                            result = {
                                url: videoUrl,
                                filename: `twitter_${author}_${statusId}.mp4`,
                                status: 'redirect'
                            };
                        }
                    }
                }
            } catch (e) {
                console.log('fxtwitter fallback failed:', e.message);
            }
        }

        if (result && result.url) {
            // directCdn: YouTube CDN URL from ytdl-core — return directly to browser (no proxy)
            // Tunnel URLs: Cobalt tunnel URLs — return directly
            // Other CDN URLs (Instagram etc): proxy through /api/proxy
            const isTunnelUrl = result.url.includes('/tunnel') || result.url.includes('cobalt');
            const isDirectCdn = result.directCdn === true;
            const needsProxy = !isTunnelUrl && !isDirectCdn;

            let videoUrl;
            if (needsProxy) {
                videoUrl = `/api/proxy?url=${encodeURIComponent(result.url)}`;
            } else {
                videoUrl = result.url;
            }

            return res.status(200).json({
                videoUrl: videoUrl,
                filename: result.filename,
                direct: !needsProxy
            });
        } else {
            // TIER 3 Fallback/Smart Error Handling
            let errorMsg = 'Bu video indirilemedi. Sunucular videoyu bulamadı veya kısıtlama var.';
            let details = 'Lütfen farklı bir video deneyin veya URL yi kontrol edin.';

            return res.status(404).json({
                error: errorMsg,
                details: details
            });
        }
    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ error: 'İstek işlenirken hata oluştu. Lütfen tekrar deneyin.' });
    }
};
