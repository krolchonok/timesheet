const { DAYS, parseWeekStart, normalizeTaskStatus } = require('./db');

function parseTaskPayload(payload, { admin = false } = {}) {
  const result = {
    fio: String(payload.fio ?? '').trim(),
    task: String(payload.task ?? '').trim(),
    category: String(payload.category ?? '').trim(),
    comment: String(payload.comment ?? '').trim(),
    week_start: parseWeekStart(payload.week_start),
  };
  if (admin) {
    result.final_task = String(payload.final_task ?? '').trim();
    result.status = normalizeTaskStatus(payload.status);
  }
  for (const day of DAYS) {
    const raw = String(payload[day] ?? 0).replace(',', '.');
    const value = Number(raw);
    result[day] = Number.isFinite(value) ? Math.max(0, value) : 0;
  }
  return result;
}

module.exports = { parseTaskPayload };
