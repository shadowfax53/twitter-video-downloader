// Vercel Edge Runtime - no 4.5MB body size limit, streaming optimized
export const config = {
    runtime: 'edge',
};

export default async function handler(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET,OPTIONS',
                'Access-Control-Allow-Headers': '*',
            },
        });
    }

    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    if (!url) {
        return new Response('URL is required', { status: 400 });
    }

    try {
        // Fetch the video from the tunnel URL
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });

        if (!response.ok) {
            return new Response(`Upstream error: ${response.status}`, { status: response.status });
        }

        // Get filename from upstream Content-Disposition
        let filename = 'video.mp4';
        const upstreamDisposition = response.headers.get('content-disposition');
        if (upstreamDisposition) {
            const match = upstreamDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            if (match && match[1]) {
                filename = match[1].replace(/['"]/g, '');
            }
        }

        // Build response headers
        const headers = {
            'Access-Control-Allow-Origin': '*',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Content-Type': response.headers.get('content-type') || 'video/mp4',
            'Cache-Control': 'no-cache',
        };

        // Forward content-length if available
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
            headers['Content-Length'] = contentLength;
        }

        // Stream the response body directly (no buffering, no size limit)
        return new Response(response.body, {
            status: 200,
            headers,
        });

    } catch (err) {
        // Fallback: redirect directly to the URL
        return Response.redirect(url, 307);
    }
}