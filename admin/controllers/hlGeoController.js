const hlGeoService = require("../services/hlGeoService");

const list = async (req, res, next) => {
  try {
    const { fkHLId } = req.query;
    const geolocations = await hlGeoService.listHLGeolocations(
      fkHLId ? parseInt(fkHLId, 10) : null
    );
    return res.json({ success: true, geolocations });
  } catch (err) {
    return next(err);
  }
};

const getById = async (req, res, next) => {
  try {
    const geo = await hlGeoService.getHLGeolocationById(req.params.pkGeoId);
    if (!geo) {
      return res.status(404).json({ success: false, message: "Geolocation not found" });
    }
    return res.json({ success: true, geolocation: geo });
  } catch (err) {
    return next(err);
  }
};

const create = async (req, res, next) => {
  try {
    const { fkHLId, OfficeName, Latitude, Longitude, RadiusMeters } = req.body;

    if (!fkHLId || Latitude === undefined || Longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: "fkHLId, Latitude and Longitude are required",
      });
    }

    const newGeo = await hlGeoService.createHLGeolocation({
      fkHLId: parseInt(fkHLId, 10),
      OfficeName: OfficeName || null,
      Latitude: parseFloat(Latitude),
      Longitude: parseFloat(Longitude),
      RadiusMeters: RadiusMeters ? parseInt(RadiusMeters, 10) : 50,
    });

    return res.status(201).json({ success: true, geolocation: newGeo });
  } catch (err) {
    return next(err);
  }
};

const update = async (req, res, next) => {
  try {
    const pkGeoId = req.params.pkGeoId;
    const { OfficeName, Latitude, Longitude, RadiusMeters, IsActive } = req.body;

    const updated = await hlGeoService.updateHLGeolocation(pkGeoId, {
      OfficeName: OfficeName !== undefined ? OfficeName : undefined,
      Latitude: Latitude !== undefined ? parseFloat(Latitude) : undefined,
      Longitude: Longitude !== undefined ? parseFloat(Longitude) : undefined,
      RadiusMeters: RadiusMeters !== undefined ? parseInt(RadiusMeters, 10) : undefined,
      IsActive: IsActive !== undefined ? !!IsActive : undefined,
    });

    if (!updated) {
      return res.status(404).json({ success: false, message: "Geolocation not found" });
    }

    return res.json({ success: true, geolocation: updated });
  } catch (err) {
    return next(err);
  }
};

const remove = async (req, res, next) => {
  try {
    const result = await hlGeoService.deleteHLGeolocation(req.params.pkGeoId);
    return res.json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
