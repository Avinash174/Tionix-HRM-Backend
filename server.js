const path = require("path");
const fs = require("fs");
const os = require("os");
const express = require("express");
const http = require("http");
const https = require("https");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");
const { errorResponse } = require("./utils/apiError");

// Import Routes
const authRoutes = require("./routes/authRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const employeeRoutes = require("./routes/employeeRoutes");
const profileRoutes = require("./routes/profileRoutes");
const adminRoutes = require("./admin/routes");
const { initSockets } = require("./sockets");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/demo", express.static(path.join(__dirname, "demo")));

app.get("/admin-map", (req, res) => {
  res.sendFile(path.join(__dirname, "demo", "live-map.html"));
});

app.get("/admin-map/config.js", (req, res) => {
  res.type("application/javascript").send(
    `window.ADMIN_MAP_CONFIG = ${JSON.stringify({
      apiBase: "",
      googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || "",
    })};`
  );
});

// Base Route
app.get("/", (req, res) => {
  res.json({
    message: "HRM Backend Running",
    environment: process.env.NODE_ENV || "development",
    vercel: !!process.env.VERCEL,
  });
});

// Routes Implementation (MVC Pattern)
app.use("/", authRoutes); 
app.use("/api", authRoutes); // Added to match /api/login if requested
app.use("/attendance", attendanceRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/employees", employeeRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/profile", profileRoutes);
app.use("/api/profile", profileRoutes);
app.use("/admin", adminRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/hrm/admin", adminRoutes);

// Global error handler for serverless (prevents hard crashes)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(err.statusCode || 500).json(
    errorResponse(
      err,
      process.env.NODE_ENV === "production"
        ? "Something went wrong"
        : "Internal Server Error"
    )
  );
});

const PORT = parseInt(process.env.PORT || "5000", 10);
const HOST = process.env.HOST || "0.0.0.0";
const USE_HTTPS =
  String(process.env.USE_HTTPS || "")
    .trim()
    .toLowerCase() === "true";

const getLanIpv4Addresses = () => {
  const ips = [];
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return [...new Set(ips)];
};

const createHttpServer = () => {
  if (!USE_HTTPS) return http.createServer(app);

  const keyPath =
    process.env.SSL_KEY_PATH || path.join(__dirname, "certs", "key.pem");
  const certPath =
    process.env.SSL_CERT_PATH || path.join(__dirname, "certs", "cert.pem");

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error(
      "USE_HTTPS=true but certs missing. Run: npm run cert:dev\n" +
        "  Or set SSL_KEY_PATH / SSL_CERT_PATH"
    );
    process.exit(1);
  }

  return https.createServer(
    {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    },
    app
  );
};

const server = createHttpServer();
initSockets(server);

const logServerUrls = () => {
  const protocol = USE_HTTPS ? "https" : "http";
  console.log(`Server running (${protocol}) on ${HOST}:${PORT}`);
  if (HOST === "0.0.0.0" || HOST === "::") {
    console.log(`  Local:  ${protocol}://127.0.0.1:${PORT}`);
    for (const ip of getLanIpv4Addresses()) {
      console.log(`  LAN:    ${protocol}://${ip}:${PORT}`);
    }
  } else {
    console.log(`  URL:    ${protocol}://${HOST}:${PORT}`);
  }
};

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, HOST, () => logServerUrls());
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.error(
          `Port ${PORT} is already in use. Stop the other process:\n` +
            `  lsof -ti :${PORT} | xargs kill -9`
        );
        process.exit(1);
      }
      throw err;
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
};

// Only start the server when running locally (not on Vercel)
if (require.main === module) {
  startServer();
}

// Export the Express app for Vercel Serverless Functions
module.exports = app;
