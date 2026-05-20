const gpsAttendanceService = require("../services/gpsAttendanceService");
const { GpsAttendanceError } = gpsAttendanceService;

const handleGpsAttendanceError = (res, error, fallbackMessage) => {
  if (error instanceof GpsAttendanceError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      ...error.details,
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: error.message || fallbackMessage,
  });
};

const punchIn = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const result = await gpsAttendanceService.markAttendance({
      employeeId: req.user?.id,
      latitude,
      longitude,
      attendanceType: "check_in",
    });

    return res.status(201).json({
      success: true,
      message: "Punch in successful",
      data: result,
    });
  } catch (error) {
    return handleGpsAttendanceError(res, error, "Unable to punch in");
  }
};

const punchOut = async (req, res) => {
  try {
    const { latitude, longitude } = req.body || {};
    const result = await gpsAttendanceService.markAttendance({
      employeeId: req.user?.id,
      latitude,
      longitude,
      attendanceType: "check_out",
    });

    return res.status(201).json({
      success: true,
      message: "Punch out successful",
      data: result,
    });
  } catch (error) {
    return handleGpsAttendanceError(res, error, "Unable to punch out");
  }
};

const getAttendanceHistory = async (req, res) => {
  try {
    const records = await gpsAttendanceService.getEmployeeAttendance(req.user?.id);
    return res.json({
      success: true,
      data: records,
    });
  } catch (error) {
    return handleGpsAttendanceError(res, error, "Unable to fetch attendance history");
  }
};

module.exports = {
  punchIn,
  punchOut,
  getAttendanceHistory,
};
