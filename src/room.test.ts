import { describe, expect, it } from "vitest";
import {
  appendEvent,
  createInitialRoom,
  decideAction,
  setRoomPhase
} from "./room";

describe("operations room state", () => {
  it("starts with a visible objective and an approval queue", () => {
    const room = createInitialRoom();
    expect(room.objective).toContain("verified launch decision");
    expect(room.actions.some((action) => action.status === "queued")).toBe(
      true
    );
  });

  it("records an approval as an auditable event", () => {
    const room = createInitialRoom();
    const next = decideAction(
      room,
      "action-release-notes",
      "approved",
      "Reviewer"
    );
    expect(next.actions[0].status).toBe("approved");
    expect(next.events.at(-1)).toMatchObject({
      actor: "Reviewer",
      kind: "decision",
      text: "Approved: Publish release notes"
    });
  });

  it("does not complete an action before approval", () => {
    const room = createInitialRoom();
    expect(() =>
      decideAction(room, "action-release-notes", "done", "Reviewer")
    ).toThrow("Only approved actions can be completed");
  });

  it("supports pause and resume while the operation is active", () => {
    const paused = setRoomPhase(createInitialRoom(), "paused", "Operator");
    const resumed = setRoomPhase(paused, "running", "Operator");
    expect(paused.phase).toBe("paused");
    expect(resumed.phase).toBe("running");
  });

  it("keeps completed rooms closed", () => {
    const complete = setRoomPhase(createInitialRoom(), "completed", "Operator");
    expect(() => setRoomPhase(complete, "running", "Operator")).toThrow(
      "A completed room cannot be resumed"
    );
  });

  it("bounds room history to sixty events", () => {
    let room = createInitialRoom();
    for (let index = 0; index < 80; index += 1) {
      room = appendEvent(room, {
        actor: "Agent",
        kind: "agent",
        text: `Finding ${index}`
      });
    }
    expect(room.events).toHaveLength(60);
    expect(room.events[0].text).toBe("Finding 20");
  });
});
