import { Router, Request, Response } from "express";
import { z } from "zod";
import {
  getChannelTasks,
  getTask,
  createTask,
  updateTaskStatus,
  type AgentTask,
} from "../services/manager-service.js";

export const taskRouter = Router();

// GET /api/tasks/:channelId — list tasks for a channel
taskRouter.get("/:channelId", (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const tasks = getChannelTasks(channelId);

    // Separate parent tasks and sub-tasks
    const parentTasks = tasks.filter((t) => !t.parentTaskId);
    const result = parentTasks.map((parent) => ({
      ...parent,
      subTasks: tasks.filter((t) => t.parentTaskId === parent.id),
    }));

    res.json({ data: result });
  } catch (err) {
    console.error("List tasks error:", err);
    res.status(500).json({ error: "Failed to list tasks" });
  }
});

// GET /api/tasks/:channelId/:taskId — get task detail
taskRouter.get("/:channelId/:taskId", (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const task = getTask(taskId);

    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    // If it's a parent task, include sub-tasks
    const channelTasks = getChannelTasks(task.channelId);
    const subTasks = channelTasks.filter((t) => t.parentTaskId === task.id);

    res.json({
      data: {
        ...task,
        subTasks,
      },
    });
  } catch (err) {
    console.error("Get task error:", err);
    res.status(500).json({ error: "Failed to get task" });
  }
});

// POST /api/tasks/:channelId — manually create a task
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  parentTaskId: z.string().optional(),
  assignedAgentId: z.string().optional(),
  assignedAgentName: z.string().optional(),
  managerAgentId: z.string(),
});

taskRouter.post("/:channelId", (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const body = createTaskSchema.parse(req.body);

    const task = createTask({
      channelId,
      title: body.title,
      description: body.description,
      status: "pending",
      parentTaskId: body.parentTaskId,
      assignedAgentId: body.assignedAgentId,
      assignedAgentName: body.assignedAgentName,
      managerAgentId: body.managerAgentId,
    });

    res.json({ data: task });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Create task error:", err);
    res.status(500).json({ error: "Failed to create task" });
  }
});

// PUT /api/tasks/:taskId/status — update task status
const updateStatusSchema = z.object({
  status: z.enum(["pending", "assigned", "in_progress", "completed", "failed"]),
  result: z.string().optional(),
});

taskRouter.put("/:taskId/status", (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;
    const body = updateStatusSchema.parse(req.body);

    const updated = updateTaskStatus(taskId, body.status, body.result);
    if (!updated) {
      res.status(404).json({ error: "Task not found" });
      return;
    }

    res.json({ data: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors[0].message });
      return;
    }
    console.error("Update task status error:", err);
    res.status(500).json({ error: "Failed to update task status" });
  }
});
