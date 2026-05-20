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

module.exports = {
  listOffices,
  getOffice,
};
