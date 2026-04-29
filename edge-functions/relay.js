import express from 'express';
import fetch from 'node-fetch';   // برای Node.js < 18 نیاز به نصب داری، ولی Render معمولاً 20+ دارد

const app = express();
const PORT = process.env.PORT || 10000;

const TARGET_BASE = (process.env.TARGET_DOMAIN || "").replace(/\/$/, "");

if (!TARGET_BASE) {
  console.error("❌ TARGET_DOMAIN environment variable is not set!");
  process.exit(1);
}

const STRIP_HEADERS = new Set([
  "host", "connection", "keep-alive", "proxy-authenticate",
  "proxy-authorization", "te", "trailer", "transfer-encoding",
  "upgrade", "forwarded", "x-forwarded-host", "x-forwarded-proto",
  "x-forwarded-port", "x-real-ip"
]);

app.use(async (req, res) => {
  try {
    const targetUrl = TARGET_BASE + req.originalUrl;

    const headers = {};
    let clientIp = req.ip || req.socket.remoteAddress;

    for (const [key, value] of Object.entries(req.headers)) {
      const k = key.toLowerCase();
      if (STRIP_HEADERS.has(k)) continue;
      if (k.startsWith("x-nf-") || k.startsWith("x-netlify-")) continue;
      if (k === "x-real-ip" || k === "x-forwarded-for") {
        clientIp = value;
        continue;
      }
      headers[key] = value;
    }

    if (clientIp) headers["x-forwarded-for"] = clientIp;
    headers["x-forwarded-proto"] = "https";   // چون Render SSL را terminate می‌کند

    const fetchOptions = {
      method: req.method,
      headers,
      redirect: "manual",
    };

    // بدن درخواست (برای POST, PUT و غیره)
    if (req.method !== "GET" && req.method !== "HEAD") {
      fetchOptions.body = req.rawBody || req.body;
    }

    const upstream = await fetch(targetUrl, fetchOptions);

    // کپی هدرها به پاسخ
    res.status(upstream.status);
    for (const [key, value] of upstream.headers) {
      if (key.toLowerCase() !== "transfer-encoding") {
        res.setHeader(key, value);
      }
    }

    // استریم بدن پاسخ
    upstream.body.pipe(res);

  } catch (error) {
    console.error("Proxy error:", error);
    res.status(502).send("Bad Gateway: Relay Failed");
  }
});

// مهم: برای خواندن body به صورت raw (برای پروکسی دقیق)
app.use(express.raw({ type: '*/*', limit: '50mb' }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Relay proxy running on port ${PORT}`);
  console.log(`→ Forwarding all traffic to: ${TARGET_DOMAIN}`);
});