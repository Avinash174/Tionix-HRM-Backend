const { emitEvent } = require("../../sockets");

const notifications = [];

const listNotifications = () => notifications.slice().reverse();

const sendNotification = ({ title, message, type = "info", payload }) => {
  const notification = {
    id: `notif_${Date.now()}`,
    title,
    message,
    type,
    payload,
    createdAt: new Date().toISOString(),
  };
  notifications.push(notification);
  emitEvent("attendance-alert", notification);
  return notification;
};

module.exports = {
  listNotifications,
  sendNotification,
};
