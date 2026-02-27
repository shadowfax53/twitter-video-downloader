// Multi-client InnerTube debug — Vercel'de hangi client çalışıyor test et
const axios = require('axios');

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const videoId = req.query.v || 'lBg-bld9TU0';
    const results = {};

    const clients = [
        { name: 'TVHTML5_EMBEDDED', clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', ua: 'Mozilla/5.0', thirdParty: { embedUrl: 'https://www.google.com' } },
        { name: 'IOS', clientName: 'IOS', clientVersion: '19.09.3', ua: 'com.google.ios.youtube/19.09.3 (iPhone14,3; U; CPU iOS 15_6 like Mac OS X)', extra: { deviceModel: 'iPhone14,3' } },
        { name: 'WEB_EMBEDDED', clientName: 'WEB_EMBEDDED_PLAYER', clientVersion: '1.20240101.0.0', ua: 'Mozilla/5.0', thirdParty: { embedUrl: 'https://www.google.com' } },
        { name: 'ANDROID', clientName: 'ANDROID', clientVersion: '19.09.37', ua: 'com.google.android.youtube/19.09.37 (Linux; U; Android 11) gzip', extra: { androidSdkVersion: 30 } },
        { name: 'MWEB', clientName: 'MWEB', clientVersion: '2.20240101.0.0', ua: 'Mozilla/5.0' },
    ];

    for (const c of clients) {
        try {
            const payload = {
                videoId,
                context: {
                    client: { clientName: c.clientName, clientVersion: c.clientVersion, hl: 'en', gl: 'US', ...c.extra }
                },
                contentCheckOk: true,
                racyCheckOk: true
            };
            if (c.thirdParty) payload.context.thirdParty = c.thirdParty;

            const r = await axios.post(
                'https://www.youtube.com/youtubei/v1/player?key=AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w&prettyPrint=false',
                payload,
                { headers: { 'Content-Type': 'application/json', 'User-Agent': c.ua }, timeout: 8000 }
            );

            const status = r.data?.playabilityStatus?.status;
            const formats = r.data?.streamingData?.formats?.length || 0;
            const adaptive = r.data?.streamingData?.adaptiveFormats?.length || 0;
            const firstUrl = r.data?.streamingData?.formats?.[0]?.url ? 'YES' : 'NO';

            results[c.name] = { status, formats, adaptive, hasDirectUrl: firstUrl, reason: r.data?.playabilityStatus?.reason || 'none' };
        } catch (e) {
            results[c.name] = { error: e.message.substring(0, 80) };
        }
    }

    return res.status(200).json({ videoId, results });
};
