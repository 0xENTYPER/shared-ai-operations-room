import { useCallback, useMemo, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  ArrowRightIcon,
  CheckIcon,
  CircleNotchIcon,
  PauseIcon,
  PlayIcon,
  ShieldCheckIcon,
  SparkleIcon,
  UserFocusIcon,
  XIcon
} from "@phosphor-icons/react";
import type { OperationsRoom } from "./server";
import { createInitialRoom, type RoomAction, type RoomState } from "./room";

const actor = "You";

function relativeTime(value: string) {
  const minutes = Math.max(
    0,
    Math.round((Date.now() - new Date(value).getTime()) / 60_000)
  );
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

function ActionItem({
  action,
  onDecision
}: {
  action: RoomAction;
  onDecision: (id: string, decision: "approved" | "rejected" | "done") => void;
}) {
  return (
    <article className={`action-item action-${action.status}`}>
      <div className="action-topline">
        <span className={`risk risk-${action.risk}`}>{action.risk}</span>
        <span className="action-system">{action.system}</span>
      </div>
      <h3>{action.title}</h3>
      <p>{action.detail}</p>
      {action.status === "queued" && (
        <div className="action-buttons">
          <button
            className="icon-command approve"
            onClick={() => onDecision(action.id, "approved")}
            aria-label="Approve action"
            title="Approve"
          >
            <CheckIcon weight="bold" />
          </button>
          <button
            className="icon-command reject"
            onClick={() => onDecision(action.id, "rejected")}
            aria-label="Reject action"
            title="Reject"
          >
            <XIcon weight="bold" />
          </button>
        </div>
      )}
      {action.status === "approved" && (
        <button
          className="complete-command"
          onClick={() => onDecision(action.id, "done")}
        >
          Mark complete <ArrowRightIcon weight="bold" />
        </button>
      )}
      {(action.status === "rejected" || action.status === "done") && (
        <div className="resolved-label">
          {action.status === "done" ? <CheckIcon /> : <XIcon />}
          {action.status}
        </div>
      )}
    </article>
  );
}

function ToolPart({
  part,
  decide
}: {
  part: UIMessage["parts"][number];
  decide: (response: { id: string; approved: boolean }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  if ("approval" in part && part.state === "approval-requested") {
    const id = (part.approval as { id?: string }).id;
    return (
      <div className="approval-block">
        <div className="approval-heading">
          <ShieldCheckIcon /> Human approval required
        </div>
        <strong>
          {name === "requestExternalAction" ? "External action" : name}
        </strong>
        <pre>{JSON.stringify(part.input, null, 2)}</pre>
        <div className="approval-actions">
          <button onClick={() => id && decide({ id, approved: true })}>
            <CheckIcon /> Approve
          </button>
          <button onClick={() => id && decide({ id, approved: false })}>
            <XIcon /> Reject
          </button>
        </div>
      </div>
    );
  }
  if (part.state === "output-available") {
    return (
      <div className="tool-result">
        <CheckIcon /> {name} completed
      </div>
    );
  }
  if (part.state === "output-denied" || part.state === "output-error") {
    return (
      <div className="tool-result tool-failed">
        <XIcon /> {name} stopped
      </div>
    );
  }
  return (
    <div className="tool-result">
      <CircleNotchIcon className="spin" /> Running {name}
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [room, setRoom] = useState<RoomState>(() => createInitialRoom());
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const agent = useAgent<OperationsRoom, RoomState>({
    agent: "OperationsRoom",
    name: "launch-readiness",
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onStateUpdate: useCallback((state: RoomState) => setRoom(state), [])
  });

  const { messages, sendMessage, addToolApprovalResponse, stop, status } =
    useAgentChat({ agent, experimental_throttle: 80 });
  const busy = status === "streaming" || status === "submitted";
  const pending = useMemo(
    () => room.actions.filter((action) => action.status === "queued").length,
    [room.actions]
  );

  const send = () => {
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
    setInput("");
  };

  const decide = async (
    id: string,
    decision: "approved" | "rejected" | "done"
  ) => {
    await agent.stub.decide(id, decision, actor);
  };

  const togglePause = async () => {
    await agent.stub.changePhase(
      room.phase === "paused" ? "running" : "paused",
      actor
    );
  };

  const addNote = async () => {
    if (!note.trim()) return;
    await agent.stub.addInstruction(note, actor);
    setNote("");
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <SparkleIcon weight="fill" />
          </span>
          <span>Relay Room</span>
          <span className="brand-tag">shared AI operations</span>
        </div>
        <div className="topbar-meta">
          <span className={`connection ${connected ? "online" : ""}`}>
            <i />
            {connected ? "Live room" : "Connecting"}
          </span>
          <span className="room-code">ROOM / LR-204</span>
          <button
            className="control-button"
            onClick={togglePause}
            title={room.phase === "paused" ? "Resume room" : "Pause room"}
          >
            {room.phase === "paused" ? (
              <PlayIcon weight="fill" />
            ) : (
              <PauseIcon weight="fill" />
            )}
            {room.phase === "paused" ? "Resume" : "Pause"}
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="context-panel">
          <div className="section-label">Current operation</div>
          <h1>{room.title}</h1>
          <p className="objective">{room.objective}</p>
          <dl className="room-facts">
            <div>
              <dt>Status</dt>
              <dd>
                <span className={`phase phase-${room.phase}`}>
                  {room.phase.replace("_", " ")}
                </span>
              </dd>
            </div>
            <div>
              <dt>Control</dt>
              <dd>{room.controller}</dd>
            </div>
            <div>
              <dt>Open decisions</dt>
              <dd>{pending}</dd>
            </div>
          </dl>

          <div className="section-label people-label">In this room</div>
          <div className="member-list">
            {room.members.map((member) => (
              <div className="member" key={member.id}>
                <span className={`avatar avatar-${member.color}`}>
                  {member.initials}
                </span>
                <span>
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                </span>
                <i className={member.online ? "member-online" : ""} />
              </div>
            ))}
          </div>
          <button
            className="take-control"
            onClick={() => agent.stub.takeControl(actor)}
          >
            <UserFocusIcon /> Take control
          </button>
        </aside>

        <section className="conversation-panel">
          <div className="panel-heading">
            <div>
              <span className="section-label">Agent workspace</span>
              <h2>Live reasoning and decisions</h2>
            </div>
            <span className="guardrail">
              <ShieldCheckIcon /> approval gates on
            </span>
          </div>

          <div className="message-feed">
            <div className="agent-entry">
              <div className="agent-icon">
                <SparkleIcon weight="fill" />
              </div>
              <div>
                <div className="message-meta">
                  <strong>Room agent</strong>
                  <span>initial plan</span>
                </div>
                <p>
                  I split the launch review into API health, billing, customer
                  communication, and rollback readiness. I can investigate
                  independently; publishing or changing production requires
                  approval.
                </p>
                <div className="plan-grid">
                  <span>01 API health</span>
                  <span>02 Billing</span>
                  <span>03 Comms</span>
                  <span>04 Rollback</span>
                </div>
              </div>
            </div>

            {messages.map((message) => (
              <div
                className={
                  message.role === "user" ? "user-entry" : "agent-entry"
                }
                key={message.id}
              >
                <div
                  className={
                    message.role === "user" ? "user-icon" : "agent-icon"
                  }
                >
                  {message.role === "user" ? (
                    "YO"
                  ) : (
                    <SparkleIcon weight="fill" />
                  )}
                </div>
                <div>
                  <div className="message-meta">
                    <strong>
                      {message.role === "user" ? "You" : "Room agent"}
                    </strong>
                    <span>{busy ? "working" : "now"}</span>
                  </div>
                  {message.parts.map((part, index) => {
                    if (part.type === "text")
                      return (
                        <p className="message-text" key={index}>
                          {part.text}
                        </p>
                      );
                    if (isToolUIPart(part))
                      return (
                        <ToolPart
                          key={index}
                          part={part}
                          decide={addToolApprovalResponse}
                        />
                      );
                    return null;
                  })}
                </div>
              </div>
            ))}
            {busy && (
              <div className="working">
                <CircleNotchIcon className="spin" /> Agent is working
              </div>
            )}
          </div>

          <div className="composer">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder="Give the room agent a goal or ask for evidence..."
              rows={2}
            />
            <div className="composer-bottom">
              <span>Team-visible instruction</span>
              {busy ? (
                <button className="send-button stop" onClick={stop}>
                  <XIcon /> Stop
                </button>
              ) : (
                <button
                  className="send-button"
                  onClick={send}
                  disabled={!input.trim()}
                >
                  Send <ArrowRightIcon weight="bold" />
                </button>
              )}
            </div>
          </div>
        </section>

        <aside className="decision-panel">
          <div className="panel-heading compact">
            <div>
              <span className="section-label">Decision queue</span>
              <h2>{pending} pending</h2>
            </div>
          </div>
          <div className="action-list">
            {room.actions.map((action) => (
              <ActionItem key={action.id} action={action} onDecision={decide} />
            ))}
          </div>

          <div className="section-label timeline-label">Room log</div>
          <div className="timeline">
            {[...room.events]
              .reverse()
              .slice(0, 6)
              .map((event) => (
                <div
                  className={`timeline-event event-${event.kind}`}
                  key={event.id}
                >
                  <i />
                  <div>
                    <strong>{event.actor}</strong>
                    <p>{event.text}</p>
                    <time>{relativeTime(event.createdAt)}</time>
                  </div>
                </div>
              ))}
          </div>

          <div className="note-box">
            <label htmlFor="room-note">Add to room memory</label>
            <div>
              <input
                id="room-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Decision, context, constraint..."
              />
              <button onClick={addNote} aria-label="Add note">
                <ArrowRightIcon />
              </button>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
