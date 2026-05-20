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
