import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { AGENT_ROLE_PROMPTS } from "@slock/shared";
import type { AgentRole } from "@slock/shared";
import { PRESET_TOOL_DEFINITIONS } from "../skills/preset-skills.js";

export const agentRouter = Router();

const createAgentSchema = z.object({
  name: z.string().min(1).max(50),
  role: z.string().default("custom"),
  avatar: z.string().optional(),
  description: z.string().min(1),
  systemPrompt: z.string().optional(),
  model: z.string().default("claude-sonnet-4-6"),
  provider: z.string().default("anthropic"),
  thinkingLevel: z.enum(["none", "low", "medium", "high"]).default("none"),
  capabilities: z.array(z.string()).default(["chat", "auto_respond"]),
  tools: z.array(z.any()).default([]),
});

function serializeAgent(agent: any) {
  return {
    id: agent.id,
    name: agent.name,
    role: agent.role,
    avatar: agent.avatar,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    model: agent.model,
    provider: agent.provider,
    thinkingLevel: agent.thinkingLevel || "none",
    isActive: agent.isActive,
    capabilities: JSON.parse(agent.capabilities || "[]"),
    tools: JSON.parse(agent.tools || "[]"),
    createdAt: agent.createdAt.toISOString(),
  };
}

// Get preset skills for a role
agentRouter.get("/skills/presets", (req: Request, res: Response) => {
  const role = (req.query.role as string) || "custom";
  const presets = PRESET_TOOL_DEFINITIONS[role as AgentRole];
  if (!presets) {
    res.json({ data: PRESET_TOOL_DEFINITIONS.custom });
    return;
  }
  res.json({ data: presets });
});

// List all agents
agentRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const agents = await prisma.agentConfig.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: agents.map(serializeAgent) });
  } catch (err) {
    console.error("List agents error:", err);
    res.status(500).json({ error: "Failed to list agents" });
  }
});

// Create agent
agentRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = createAgentSchema.parse(req.body);
    const defaultPrompt = AGENT_ROLE_PROMPTS[body.role as AgentRole]
      || `You are a ${body.role}. ${body.description}. Respond as an expert in this field, providing actionable and professional guidance.`;

    const agent = await prisma.agentConfig.create({
      data: {
        name: body.name,
        role: body.role,
        avatar: body.avatar,
        description: body.description,
        systemPrompt: body.systemPrompt || defaultPrompt,
        model: body.model,
        provider: body.provider,
        thinkingLevel: body.thinkingLevel,
        capabilities: JSON.stringify(body.capabilities),
        tools: JSON.stringify(body.tools),
      },
    });

    res.json({ data: serializeAgent(agent) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create agent error:", err);
    res.status(500).json({ error: "Failed to create agent" });
  }
});

// Get agent detail
agentRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await prisma.agentConfig.findUnique({
      where: { id: req.params.id },
      include: {
        channels: { include: { channel: { select: { id: true, name: true } } } },
      },
    });

    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    res.json({
      data: {
        ...serializeAgent(agent),
        channels: agent.channels.map((ca) => ca.channel),
      },
    });
  } catch (err) {
    console.error("Get agent error:", err);
    res.status(500).json({ error: "Failed to get agent" });
  }
});

// Update agent
agentRouter.put("/:id", async (req: Request, res: Response) => {
  try {
    const data: Record<string, any> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.role !== undefined) data.role = req.body.role;
    if (req.body.avatar !== undefined) data.avatar = req.body.avatar;
    if (req.body.description !== undefined) data.description = req.body.description;
    if (req.body.systemPrompt !== undefined) data.systemPrompt = req.body.systemPrompt;
    if (req.body.model !== undefined) data.model = req.body.model;
    if (req.body.provider !== undefined) data.provider = req.body.provider;
    if (req.body.thinkingLevel !== undefined) data.thinkingLevel = req.body.thinkingLevel;
    if (req.body.isActive !== undefined) data.isActive = req.body.isActive;
    if (req.body.capabilities !== undefined) data.capabilities = JSON.stringify(req.body.capabilities);
    if (req.body.tools !== undefined) data.tools = JSON.stringify(req.body.tools);

    const agent = await prisma.agentConfig.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ data: serializeAgent(agent) });
  } catch (err) {
    console.error("Update agent error:", err);
    res.status(500).json({ error: "Failed to update agent" });
  }
});

// Delete agent
agentRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    await prisma.agentConfig.delete({ where: { id: req.params.id } });
    res.json({ message: "Agent deleted" });
  } catch (err) {
    console.error("Delete agent error:", err);
    res.status(500).json({ error: "Failed to delete agent" });
  }
});
