const http = require("http");
const fs = require("fs");
const path = require("path");

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8"
};

http
  .createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const route = url.pathname === "/" ? "/index.html" : url.pathname;
    const filePath = path.join(__dirname, decodeURIComponent(route));

    fs.readFile(filePath, (error, data) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, { "Content-Type": types[path.extname(filePath)] || "text/plain; charset=utf-8" });
      response.end(data);
    });
  })
  .listen(4173, "127.0.0.1", () => {
    console.log("SonetPay Tracker running at http://127.0.0.1:4173");
  });
