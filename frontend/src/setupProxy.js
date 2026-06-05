const { createProxyMiddleware } = require('http-proxy-middleware');

const target = process.env.REACT_APP_BACKEND_URL || 'http://127.0.0.1:8000';

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: true,
    })
  );
};
