import assert from "node:assert/strict";
import test from "node:test";
import operatorReviewAction from "./operator-review-action.cjs";

const actionId = "062be2d8-767d-4187-a0e2-b93e04a45b32";

test("linked action object yields only its UUID id", () => {
  assert.equal(operatorReviewAction.extractOperatorReviewActionId({
    id: actionId,
    status: "pending_verification",
    metadata: { internal: "not-forwarded" },
  }), actionId);
});

test("direct UUID is accepted", () => {
  assert.equal(operatorReviewAction.extractOperatorReviewActionId(actionId), actionId);
});

test("composite rows, arrays and serialized objects are rejected", () => {
  assert.equal(operatorReviewAction.extractOperatorReviewActionId(`(${actionId},resolved,{})`), "");
  assert.equal(operatorReviewAction.extractOperatorReviewActionId([actionId]), "");
  assert.equal(operatorReviewAction.extractOperatorReviewActionId(JSON.stringify({ id: actionId })), "");
});
