const dotenv = require("dotenv");
dotenv.config();

const toMinutes = (dateValue) => {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;
  // SalEmpTiming/SalShiftTiming store time on 1899-12-30 — use UTC parts
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};

const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const isEnabled = () => process.env.SHIFT_VALIDATION_ENABLED !== "false";

const getGraceConfig = () => ({
  graceInMinutes: Number(process.env.SHIFT_GRACE_IN_MINUTES || 60),
  lateInMinutes: Number(process.env.SHIFT_LATE_IN_MINUTES || 120),
  earlyOutMinutes: Number(process.env.SHIFT_EARLY_OUT_MINUTES || 30),
  lateOutMinutes: Number(process.env.SHIFT_LATE_OUT_MINUTES || 120),
  strict: process.env.SHIFT_VALIDATION_STRICT === "true",
});

/**
 * @param {object} timing from shiftModel.normalizeTimingRow
 * @param {string} punchType e.g. Check IN, Check OUT
 * @param {Date} now
 */
const validatePunchAgainstShift = (timing, punchType, now = new Date()) => {
  if (!isEnabled()) {
    return { allowed: true, code: "DISABLED", message: "Shift validation disabled" };
  }

  if (!timing || !timing.startWork || !timing.endWork) {
    return {
      allowed: true,
      code: "NO_SHIFT",
      message: "No shift timing configured for this employee",
    };
  }

  const { graceInMinutes, lateInMinutes, earlyOutMinutes, lateOutMinutes, strict } =
    getGraceConfig();

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = toMinutes(timing.startWork);
  const endMin = toMinutes(timing.endWork);

  if (startMin == null || endMin == null) {
    return { allowed: true, code: "INVALID_SHIFT_TIME", message: "Shift times are invalid" };
  }

  const isNightShift = endMin < startMin;
  const normalizedNow = nowMin;

  const punch = (punchType || "").trim();

  if (punch === "Check IN") {
    const earliest = startMin - graceInMinutes;
    const latest = startMin + lateInMinutes;

    let allowed;
    let code = "ON_TIME";

    if (isNightShift) {
      allowed =
        normalizedNow >= (earliest < 0 ? earliest + 1440 : earliest) ||
        normalizedNow <= latest;
    } else {
      allowed = normalizedNow >= Math.max(0, earliest) && normalizedNow <= latest;
    }

    if (!allowed && normalizedNow < Math.max(0, earliest)) {
      return buildResult(false, "TOO_EARLY", strict, {
        message: `Check IN is too early. Shift starts at ${formatMinutes(startMin)}.`,
        shiftName: timing.shiftName,
        shiftStart: formatMinutes(startMin),
        shiftEnd: formatMinutes(endMin),
        currentTime: formatMinutes(normalizedNow),
      });
    }

    if (!allowed) {
      return buildResult(false, "TOO_LATE", strict, {
        message: `Check IN window closed. Shift started at ${formatMinutes(startMin)}.`,
        shiftName: timing.shiftName,
        shiftStart: formatMinutes(startMin),
        shiftEnd: formatMinutes(endMin),
        currentTime: formatMinutes(normalizedNow),
      });
    }

    if (normalizedNow > startMin) {
      code = "LATE";
    }

    return buildResult(true, code, strict, {
      message:
        code === "LATE"
          ? `Checked in late. Shift started at ${formatMinutes(startMin)}.`
          : "Check IN within shift window",
      shiftName: timing.shiftName,
      shiftStart: formatMinutes(startMin),
      shiftEnd: formatMinutes(endMin),
      currentTime: formatMinutes(normalizedNow),
      isLate: code === "LATE",
    });
  }

  if (punch === "Check OUT") {
    const earliest = endMin - earlyOutMinutes;
    const latest = endMin + lateOutMinutes;

    let allowed = normalizedNow >= earliest && normalizedNow <= latest;

    if (isNightShift) {
      allowed =
        normalizedNow >= earliest ||
        normalizedNow <= (latest > 1440 ? latest - 1440 : latest);
    }

    if (!allowed && normalizedNow < earliest) {
      return buildResult(false, "EARLY_OUT", strict, {
        message: `Check OUT is too early. Shift ends at ${formatMinutes(endMin)}.`,
        shiftName: timing.shiftName,
        shiftStart: formatMinutes(startMin),
        shiftEnd: formatMinutes(endMin),
        currentTime: formatMinutes(normalizedNow),
      });
    }

    if (!allowed) {
      return buildResult(false, "TOO_LATE_OUT", strict, {
        message: `Check OUT window closed. Shift ended at ${formatMinutes(endMin)}.`,
        shiftName: timing.shiftName,
        shiftStart: formatMinutes(startMin),
        shiftEnd: formatMinutes(endMin),
        currentTime: formatMinutes(normalizedNow),
      });
    }

    const code = normalizedNow < endMin ? "EARLY_OUT_ALLOWED" : "ON_TIME";
    return buildResult(true, code, strict, {
      message: "Check OUT within shift window",
      shiftName: timing.shiftName,
      shiftStart: formatMinutes(startMin),
      shiftEnd: formatMinutes(endMin),
      currentTime: formatMinutes(normalizedNow),
      isEarlyOut: normalizedNow < endMin,
    });
  }

  return {
    allowed: true,
    code: "NOT_APPLICABLE",
    message: "Shift validation applies to Check IN and Check OUT only",
    shiftName: timing.shiftName,
  };
};

const buildResult = (allowed, code, strict, extra) => {
  const shouldBlock = !allowed && strict;
  return {
    allowed: allowed || !strict,
    blocked: shouldBlock,
    code,
    ...extra,
  };
};

const buildShiftStatusPayload = (timing, validation = null) => {
  if (!timing) return null;

  const startMin = toMinutes(timing.startWork);
  const endMin = toMinutes(timing.endWork);

  return {
    shiftName: timing.shiftName,
    shiftStart: startMin != null ? formatMinutes(startMin) : null,
    shiftEnd: endMin != null ? formatMinutes(endMin) : null,
    source: timing.source,
    timingType: timing.timingType,
    punchValidation: validation
      ? {
          code: validation.code,
          message: validation.message,
          isLate: validation.isLate,
          isEarlyOut: validation.isEarlyOut,
        }
      : null,
  };
};

module.exports = {
  validatePunchAgainstShift,
  buildShiftStatusPayload,
  formatMinutes,
  toMinutes,
};
