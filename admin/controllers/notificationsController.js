const notificationsService = require("../services/notificationsService");

const listNotifications = async (req, res, next) => {
  try {
    const notifications = notificationsService.listNotifications();
    return res.json({ success: true, notifications });
  } catch (err) {
    return next(err);
  }
};

const sendNotification = async (req, res, next) => {
  try {
    const { title, message, type, payload } = req.body || {};
    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required" });
    }
    const notification = notificationsService.sendNotification({
      title,
      message,
      type,
      payload,
    });
    return res.status(201).json({ success: true, notification });
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  listNotifications,
  sendNotification,
};
