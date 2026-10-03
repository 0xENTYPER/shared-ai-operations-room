import { createWorkersAI } from "workers-ai-provider";
import { callable, routeAgentRequest } from "agents";
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  streamText,
  tool
} from "ai";
import { z } from "zod";
import {
  appendEvent,
  createInitialRoom,
  decideAction,
  setRoomPhase,
  type RoomPhase,
  type RoomState
} from "./room";

export { type RoomState } from "./room";

export class OperationsRoom extends AIChatAgent<Env, RoomState> {
  initialState: RoomState = createInitialRoom();
  maxPersistedMessages = 120;
  chatRecovery = true;
  waitForMcpConnections = true;

  @callable()
  changePhase(phase: RoomPhase, actor: string) {
    this.setState(setRoomPhase(this.state, phase, actor));
    return this.state.phase;
  }

  @callable()
  takeControl(actor: string) {
    this.setState(
      appendEvent(
        { ...this.state, controller: actor },
        {
          actor,
          kind: "control",
          text: "Took control of room decisions."
        }
      )
    );
    return this.state.controller;
  }

  @callable()
  addInstruction(text: string, actor: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean) throw new Error("Instruction cannot be empty");
    this.setState(
      appendEvent(this.state, { actor, kind: "note", text: clean })
    );
    return this.state.events.at(-1);
  }

  @callable()
  decide(
    actionId: string,
    decision: "approved" | "rejected" | "done",
    actor: string
  ) {
    this.setState(decideAction(this.state, actionId, decision, actor));
    return this.state.actions.find((action) => action.id === actionId);
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersAI = createWorkersAI({ binding: this.env.AI });
    const roomSummary = JSON.stringify({
      objective: this.state.objective,
      phase: this.state.phase,
      controller: this.state.controller,
      actions: this.state.actions
    });

    const result = streamText({
      model: workersAI("@cf/moonshotai/kimi-k2.7-code", {
        sessionAffinity: this.sessionAffinity
      }),
      system: `You are the operating agent inside a shared team room. Be concise, explicit about uncertainty, and oriented toward the room objective.

Current room state: ${roomSummary}

Rules:
- Separate observations, inferences, and proposed actions.
- Never claim an external action happened unless a tool result confirms it.
- Use recordFinding for durable discoveries that teammates should see.
- Use requestExternalAction for publishing, sending, changing production, spending money, deleting data, or contacting a customer. It requires human approval.
- If blocked, state exactly what evidence or decision is missing.`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        recordFinding: tool({
          description: "Record a verified finding in the shared room timeline",
          inputSchema: z.object({
            finding: z.string().min(1).max(500),
            evidence: z.string().min(1).max(300)
          }),
          execute: async ({ finding, evidence }) => {
            this.setState(
              appendEvent(this.state, {
                actor: "Room agent",
                kind: "agent",
                text: `${finding} Evidence: ${evidence}`
              })
            );
            return { recorded: true, finding };
          }
        }),
        requestExternalAction: tool({
          description:
            "Request approval before an external or irreversible action",
          inputSchema: z.object({
            action: z.string().min(1).max(160),
            target: z.string().min(1).max(120),
            reason: z.string().min(1).max(300)
          }),
          needsApproval: true,
          execute: async ({ action, target, reason }) => {
            this.setState(
              appendEvent(this.state, {
                actor: "Room agent",
                kind: "decision",
                text: `Approved external action: ${action} on ${target}. Reason: ${reason}`
              })
            );
            return {
              status: "approved_for_execution",
              action,
              target,
              note: "Reference MVP records approval but does not call third-party systems."
            };
          }
        })
      },
      stopWhen: stepCountIs(12),
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}

export default {
  async fetch(request: Request, env: Env) {
    const response = await routeAgentRequest(request, env);
    return response ?? new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
