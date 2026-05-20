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
  await connectDB();
  server.listen(PORT, () => {
    console.log(`Server running on ${PORT}`);
  });
};

startServer();
