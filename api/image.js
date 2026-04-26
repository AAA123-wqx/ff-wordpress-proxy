const https = require('https');
const http = require('http');

const ALLOWED_HOST = 'c00317496.candept.com';

module.exports = async function handler(req, res) {
  const imageUrl = req.query.url;

  if (!imageUrl) {
    res.status(400).send('Missing image url');
    return;
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    res.status(400).send('Invalid image url');
    return;
  }

  if (parsedUrl.hostname !== ALLOWED_HOST) {
    res.status(403).send('Image host not allowed');
    return;
  }

  proxyImage(parsedUrl.toString(), res);
};

function proxyImage(urlString, res, redirectsLeft = 3) {
  const url = new URL(urlString);
  const lib = url.protocol === 'http:' ? http : https;

  const options = {
    method: 'GET',
    headers: {
      'User-Agent': 'FlutterFlow-Image-Proxy/1.0',
      Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*',
    },
  };

  if (url.protocol === 'https:') {
    options.agent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  const request = lib.request(url, options, (originResponse) => {
    const statusCode = originResponse.statusCode || 500;

    if (
      [301, 302, 303, 307, 308].includes(statusCode) &&
      originResponse.headers.location &&
      redirectsLeft > 0
    ) {
      const redirectUrl = new URL(originResponse.headers.location, url).toString();
      originResponse.resume();
      proxyImage(redirectUrl, res, redirectsLeft - 1);
      return;
    }

    if (statusCode < 200 || statusCode >= 300) {
      res.status(statusCode).send('Image fetch failed');
      return;
    }

    res.setHeader(
      'Content-Type',
      originResponse.headers['content-type'] || 'image/webp'
    );

    res.setHeader(
      'Cache-Control',
      's-maxage=86400, stale-while-revalidate=604800'
    );

    originResponse.pipe(res);
  });

  request.on('error', (error) => {
    res.status(500).send(error.message);
  });

  request.end();
}
