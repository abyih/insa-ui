// src/setupProxy.js
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function (app) {
  app.use(
    "/restconf",
    createProxyMiddleware({
      target: "http://localhost:8181",
      changeOrigin: true,
      pathRewrite: {
        "^/restconf": "/restconf", // option to rewrite paths if needed
      },
    })
  );
};
