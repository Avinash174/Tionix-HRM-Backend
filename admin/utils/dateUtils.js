const toDateString = (date = new Date()) =>
  date.toISOString().slice(0, 10);

const parseDate = (value, fallback = new Date()) => {
  const parsed = value ? new Date(value) : fallback;
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed;
};

const getWeekRange = (reference = new Date()) => {
  const date = new Date(reference);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const start = new Date(date.setDate(diff));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

const getMonthRange = (reference = new Date()) => {
  const start = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const end = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

module.exports = {
  toDateString,
  parseDate,
  getWeekRange,
  getMonthRange,
};
