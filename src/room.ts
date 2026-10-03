export type RoomPhase =
  | "ready"
  | "running"
  | "waiting_approval"
  | "paused"
  | "completed";

export type ActionStatus = "queued" | "approved" | "rejected" | "done";

export interface RoomMember {
  id: string;
  name: string;
  role: string;
  initials: string;
  color: "lime" | "blue" | "coral" | "violet";
  online: boolean;
}

export interface RoomAction {
  id: string;
  title: string;
  detail: string;
  system: string;
  risk: "low" | "medium" | "high";
  status: ActionStatus;
  requestedBy: string;
  createdAt: string;
}

export interface RoomEvent {
  id: string;
  actor: string;
  kind: "agent" | "decision" | "control" | "note";
  text: string;
  createdAt: string;
}

export interface RoomState {
  title: string;
  objective: string;
  phase: RoomPhase;
  controller: string;
  startedAt: string;
  members: RoomMember[];
  actions: RoomAction[];
  events: RoomEvent[];
}

const now = () => new Date().toISOString();

export function createInitialRoom(): RoomState {
  const startedAt = now();
  return {
    title: "Launch readiness room",
    objective:
      "Audit the release, resolve blockers, and prepare a verified launch decision.",
    phase: "running",
    controller: "Maya",
    startedAt,
    members: [
      {
        id: "maya",
        name: "Maya",
        role: "Product lead",
        initials: "MA",
        color: "lime",
        online: true
      },
      {
        id: "noah",
        name: "Noah",
        role: "Engineering",
        initials: "NO",
        color: "blue",
        online: true
      },
      {
        id: "iris",
        name: "Iris",
        role: "Support",
        initials: "IR",
        color: "coral",
        online: false
      }
    ],
    actions: [
      {
        id: "action-release-notes",
        title: "Publish release notes",
        detail: "Share the approved launch summary with customers.",
        system: "Customer updates",
        risk: "medium",
        status: "queued",
        requestedBy: "Room agent",
        createdAt: startedAt
      },
      {
        id: "action-health-check",
        title: "Run production health check",
        detail: "Read-only verification across API, auth, and billing.",
        system: "Production",
        risk: "low",
        status: "approved",
        requestedBy: "Maya",
        createdAt: startedAt
      }
    ],
    events: [
      {
        id: "event-brief",
        actor: "Room agent",
        kind: "agent",
        text: "Converted the launch brief into four verification tracks.",
        createdAt: startedAt
      },
      {
        id: "event-control",
        actor: "Maya",
        kind: "control",
        text: "Took control of external approvals.",
        createdAt: startedAt
      }
    ]
  };
}

export function appendEvent(
  state: RoomState,
  event: Omit<RoomEvent, "id" | "createdAt">
): RoomState {
  const next: RoomEvent = {
    ...event,
    id: crypto.randomUUID(),
    createdAt: now()
  };
  return { ...state, events: [...state.events, next].slice(-60) };
}

export function decideAction(
  state: RoomState,
  actionId: string,
  decision: "approved" | "rejected" | "done",
  actor: string
): RoomState {
  const action = state.actions.find((item) => item.id === actionId);
  if (!action) throw new Error("Action not found");
  if (decision === "done" && action.status !== "approved") {
    throw new Error("Only approved actions can be completed");
  }
  const next = {
    ...state,
    actions: state.actions.map((item) =>
      item.id === actionId ? { ...item, status: decision } : item
    )
  };
  return appendEvent(next, {
    actor,
    kind: "decision",
    text: `${decision === "done" ? "Completed" : decision === "approved" ? "Approved" : "Rejected"}: ${action.title}`
  });
}

export function setRoomPhase(
  state: RoomState,
  phase: RoomPhase,
  actor: string
): RoomState {
  if (state.phase === "completed" && phase !== "completed") {
    throw new Error("A completed room cannot be resumed");
  }
  return appendEvent(
    { ...state, phase },
    {
      actor,
      kind: "control",
      text: `Changed room status to ${phase.replace("_", " ")}.`
    }
  );
}
