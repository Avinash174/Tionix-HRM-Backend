const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
require("dotenv").config();

const { connectDB } = require("./config/db");

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
  res.status(500).json({
    error: "Internal Server Error",
    message: process.env.NODE_ENV === "production" ? "Something went wrong" : err.message,
  });
});

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
initSockets(server);

const startServer = async () => {
  try {
    await connectDB();
    server.listen(PORT, () => {
      console.log(`Server running on ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
};

// Only start the server when running locally (not on Vercel)
if (require.main === module) {
  startServer();
}

// Export the Express app for Vercel Serverless Functions
module.exports = app;
