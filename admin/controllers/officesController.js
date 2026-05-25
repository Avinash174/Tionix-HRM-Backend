const officesService = require("../services/officesService");

const listOffices = async (req, res, next) => {
  try {
    const offices = await officesService.buildOfficeAnalytics();
    return res.json({ success: true, offices });
  } catch (err) {
    return next(err);
  }
};

const getOffice = async (req, res, next) => {
  try {
    const office = await officesService.getOfficeById(req.params.id);
    if (!office) {
      return res.status(404).json({ success: false, message: "Office not found" });
    }
    return res.json({ success: true, office });
  } catch (err) {
    return next(err);
  }
};

const createOffice = async (req, res, next) => {
  try {
    const { officeName, latitude, longitude, allowedRadius, locationType, address } = req.body;
    if (!officeName || latitude == null || longitude == null) {
      return res.status(400).json({ success: false, message: "officeName, latitude and longitude are required" });
    }
    const office = await officesService.createOffice({
      officeName,
      latitude: Number(latitude),
      longitude: Number(longitude),
      allowedRadius: allowedRadius != null ? Number(allowedRadius) : undefined,
      locationType,
      address,
    });
    return res.status(201).json({ success: true, office });
  } catch (err) {
    return next(err);
  }
};

const updateOffice = async (req, res, next) => {
  try {
    const office = await officesService.updateOffice(req.params.id, req.body);
    if (!office) {
      return res.status(404).json({ success: false, message: "Office not found or no changes" });
    }
    return res.json({ success: true, office });
  } catch (err) {
    return next(err);
  }
};

const deleteOffice = async (req, res, next) => {
  try {
    const success = await officesService.deleteOffice(req.params.id);
    if (!success) {
      return res.status(404).json({ success: false, message: "Office not found" });
    }
    return res.json({ success: true, message: "Office deactivated" });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listOffices,
  getOffice,
  createOffice,
  updateOffice,
  deleteOffice,
};
