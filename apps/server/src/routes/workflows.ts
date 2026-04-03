import { Router, Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { startWorkflow, approveStep } from "../services/workflow-service.js";

export const workflowRouter = Router();

const createWorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  channelId: z.string(),
  steps: z.array(
    z.object({
      agentId: z.string(),
      action: z.string(),
      prompt: z.string(),
      waitForApproval: z.boolean().default(false),
      maxTurns: z.number().default(5),
    })
  ),
});

// List workflows
workflowRouter.get("/", async (req: Request, res: Response) => {
  try {
    const channelId = req.query.channelId as string | undefined;
    const workflows = await prisma.workflow.findMany({
      where: channelId ? { channelId } : undefined,
      include: {
        steps: {
          include: { agent: { select: { id: true, name: true, role: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: workflows });
  } catch (err) {
    console.error("List workflows error:", err);
    res.status(500).json({ error: "Failed to list workflows" });
  }
});

// Create workflow
workflowRouter.post("/", async (req: Request, res: Response) => {
  try {
    const body = createWorkflowSchema.parse(req.body);

    const workflow = await prisma.workflow.create({
      data: {
        name: body.name,
        description: body.description,
        channelId: body.channelId,
        steps: {
          create: body.steps.map((step, index) => ({
            agentId: step.agentId,
            action: step.action,
            prompt: step.prompt,
            waitForApproval: step.waitForApproval,
            maxTurns: step.maxTurns,
            stepOrder: index,
          })),
        },
      },
      include: {
        steps: {
          include: { agent: { select: { id: true, name: true, role: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    res.json({ data: workflow });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create workflow error:", err);
    res.status(500).json({ error: "Failed to create workflow" });
  }
});

// Get workflow detail
workflowRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const workflow = await prisma.workflow.findUnique({
      where: { id: req.params.id },
      include: {
        steps: {
          include: { agent: { select: { id: true, name: true, role: true } } },
          orderBy: { stepOrder: "asc" },
        },
      },
    });

    if (!workflow) {
      res.status(404).json({ error: "Workflow not found" });
      return;
    }

    res.json({ data: workflow });
  } catch (err) {
    console.error("Get workflow error:", err);
    res.status(500).json({ error: "Failed to get workflow" });
  }
});

// Start workflow
workflowRouter.post("/:id/start", async (req: Request, res: Response) => {
  try {
    const { io } = await import("../index.js");
    await startWorkflow(req.params.id, io);
    res.json({ message: "Workflow started" });
  } catch (err) {
    console.error("Start workflow error:", err);
    res.status(500).json({ error: "Failed to start workflow" });
  }
});

// Pause workflow
workflowRouter.post("/:id/pause", async (req: Request, res: Response) => {
  try {
    await prisma.workflow.update({
      where: { id: req.params.id },
      data: { status: "paused" },
    });
    res.json({ message: "Workflow paused" });
  } catch (err) {
    console.error("Pause workflow error:", err);
    res.status(500).json({ error: "Failed to pause workflow" });
  }
});

// Approve/reject workflow step
workflowRouter.post("/:id/steps/:stepIndex/approve", async (req: Request, res: Response) => {
  try {
    const { approved } = req.body;
    const stepIndex = parseInt(req.params.stepIndex);
    const { io } = await import("../index.js");
    await approveStep(req.params.id, stepIndex, approved, io);
    res.json({ message: approved ? "Step approved" : "Step rejected" });
  } catch (err) {
    console.error("Approve step error:", err);
    res.status(500).json({ error: "Failed to approve step" });
  }
});
