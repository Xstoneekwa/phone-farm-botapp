/* global module */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractOperatorReviewActionId(value) {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value.id : value;
  const id = typeof candidate === "string" ? candidate.trim().toLowerCase() : "";
  return UUID_PATTERN.test(id) ? id : "";
}

module.exports = { extractOperatorReviewActionId };
