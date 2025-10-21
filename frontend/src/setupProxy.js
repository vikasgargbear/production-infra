const { createProxyMiddleware } = require('http-proxy-middleware');

const resolveTarget = () => {
  const candidates = [
    process.env.REACT_APP_API_BASE_URL,
    process.env.REACT_APP_API_URL,
    process.env.REACT_APP_BACKEND_URL,
    process.env.REACT_APP_BACKEND_API_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN,
    process.env.BACKEND_URL,
    process.env.API_BASE_URL,
  ];

  const raw = candidates.find((value) => value && value.trim()) || 'http://localhost:8000';
  const trimmed = raw.trim();
  const withProtocol = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed) ? trimmed : `https://${trimmed}`;
  const stripped = withProtocol.replace(/\/+$/, '');
  return stripped.endsWith('/api') ? stripped : `${stripped}/api`;
};

module.exports = function(app) {
  // Proxy API requests to the backend
  app.use(
    '/api',
    createProxyMiddleware({
      target: resolveTarget(),
      changeOrigin: true,
      secure: true,
      logLevel: 'debug',
      onProxyReq: (proxyReq, req, res) => {
        console.log(`[Proxy] ${req.method} ${req.url} -> ${proxyReq.path}`);
      },
      onError: (err, req, res) => {
        console.error('[Proxy Error]', err);
      }
    })
  );
};