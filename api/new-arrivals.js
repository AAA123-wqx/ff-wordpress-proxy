const https = require('https');
const http = require('http');

const WORDPRESS_PRODUCTS_URL =
  'https://c00317496.candept.com/wp-json/wc/store/v1/products/?category=168&per_page=20&orderby=date&order=desc';

function requestText(urlString, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const lib = url.protocol === 'http:' ? http : https;

    const options = {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'FlutterFlow-Vercel-Proxy/1.0',
      },
      timeout: 15000,
    };

    if (url.protocol === 'https:') {
      options.agent = new https.Agent({
        rejectUnauthorized: false,
      });
    }

    const request = lib.request(url, options, (response) => {
      const statusCode = response.statusCode || 500;

      if (
        [301, 302, 303, 307, 308].includes(statusCode) &&
        response.headers.location &&
        redirectsLeft > 0
      ) {
        const redirectUrl = new URL(response.headers.location, url).toString();
        response.resume();
        resolve(requestText(redirectUrl, redirectsLeft - 1));
        return;
      }

      let data = '';
      response.setEncoding('utf8');

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(
            new Error(
              `WordPress returned ${statusCode}: ${data.slice(0, 200)}`
            )
          );
          return;
        }

        resolve(data);
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error('WordPress request timed out'));
    });

    request.on('error', reject);
    request.end();
  });
}

function stripHtml(value) {
  return String(value || '').replace(/<[^>]*>/g, '').trim();
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const rawText = await requestText(WORDPRESS_PRODUCTS_URL);
    const products = JSON.parse(rawText);

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const imageProxyBase = `${proto}://${host}/api/image?url=`;

    const result = products.map((product) => {
      const imageUrl = product.images?.[0]?.src || '';

      const minorUnit = Number(product.prices?.currency_minor_unit ?? 2);
      const rawPrice = product.prices?.price;
      const price = rawPrice
        ? (Number(rawPrice) / Math.pow(10, minorUnit)).toFixed(minorUnit)
        : '';

      return {
        id: product.id,
        name: stripHtml(product.name),
        image: imageUrl
          ? `${imageProxyBase}${encodeURIComponent(imageUrl)}`
          : '',
        release_time: '02:00',
        price,
        currency_symbol: product.prices?.currency_symbol || '',
        permalink: product.permalink || '',
        is_in_stock: Boolean(product.is_in_stock),
      };
    });

    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
};
