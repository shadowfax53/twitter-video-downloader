// Debug endpoint — InnerTube API'yi Vercel'den doğrudan test et
const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const videoId = req.query.v || 'lBg-bld9TU0';
    const log = [];

    try {
        log.push(`Testing InnerTube for: ${videoId}`);
        log.push(`Time: ${new Date().toISOString()}`);

        const payload = {
            videoId,
            context: {
                client: {
                    clientName: 'ANDROID',
                    clientVersion: '19.09.37',
                    androidSdkVersion: 30,
                    hl: 'en',
                    gl: 'US',
                    userAgent: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip'
                }
            },
            contentCheckOk: true,
            racyCheckOk: true
        };

        log.push('Sending InnerTube request...');
        const start = Date.now();

        const r = await axios.post(
            'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip',
                    'X-YouTube-Client-Name': '3',
                    'X-YouTube-Client-Version': '19.09.37'
                },
                timeout: 15000
            }
        );

        const elapsed = Date.now() - start;
        log.push(`Response in ${elapsed}ms, status: ${r.status}`);

        if (r.data?.streamingData) {
            const sd = r.data.streamingData;
            const formats = sd.formats || [];
            const adaptive = sd.adaptiveFormats || [];
            log.push(`Formats: ${formats.length} combined, ${adaptive.length} adaptive`);
            log.push(`Title: ${r.data.videoDetails?.title}`);

            for (let f of formats) {
                log.push(`  ${f.qualityLabel}: url=${f.url ? 'YES' : 'NO'}, cipher=${f.signatureCipher ? 'YES' : 'NO'}`);
                if (f.url) {
                    log.push(`  URL: ${f.url.substring(0, 120)}...`);
                }
            }
        } else {
            log.push('No streamingData!');
            if (r.data?.playabilityStatus) {
                log.push(`PlayabilityStatus: ${r.data.playabilityStatus.status}`);
                log.push(`Reason: ${r.data.playabilityStatus.reason || 'none'}`);
            }
        }
    } catch (e) {
        log.push(`ERROR: ${e.message}`);
        if (e.response) {
            log.push(`HTTP ${e.response.status}: ${JSON.stringify(e.response.data).substring(0, 300)}`);
        }
    }

    return res.status(200).json({ log });
};
