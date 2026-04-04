import { Router, Request, Response } from "express";
import { z } from "zod";
import { Server } from "socket.io";
import type { ServerToClientEvents, ClientToServerEvents } from "@slock/shared";
import {
  getSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  executeScheduledTask,
  describeCron,
  loadSchedules,
} from "../services/scheduler-service.js";

export function createSchedulesRouter(
  io: Server<ClientToServerEvents, ServerToClientEvents>
): Router {
  const router = Router();

  // GET /api/schedules?channelId=X&agentId=Y
  router.get("/", (req: Request, res: Response) => {
    try {
      const channelId = req.query.channelId as string | undefined;
      const agentId = req.query.agentId as string | undefined;
      const schedules = getSchedules({ channelId, agentId });

      // Enrich with human-readable cron
      const enriched = schedules.map((s) => ({
        ...s,
        cronDescription: describeCron(s.cron),
      }));

      res.json({ data: enriched });
    } catch (err) {
      console.error("List schedules error:", err);
      res.status(500).json({ error: "Failed to list schedules" });
    }
  });

  // POST /api/schedules
  const createSchema = z.object({
    agentId: z.string().min(1),
    agentName: z.string().min(1),
    channelId: z.string().min(1),
    channelName: z.string().min(1),
    name: z.string().min(1).max(100),
    cron: z.string().min(1),
    prompt: z.string().min(1),
    enabled: z.boolean().default(true),
  });

  router.post("/", (req: Request, res: Response) => {
    try {
      const body = createSchema.parse(req.body);
      const schedule = createSchedule(body);
      res.json({
        data: {
          ...schedule,
          cronDescription: describeCron(schedule.cron),
        },
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.errors[0].message });
        return;
      }
      console.error("Create schedule error:", err);
      res.status(500).json({ error: "Failed to create schedule" });
    }
  });

  // PUT /api/schedules/:id
  router.put("/:id", (req: Request, res: Response) => {
    try {
      const schedule = updateSchedule(req.params.id as string, req.body);
      res.json({
        data: {
          ...schedule,
          cronDescription: describeCron(schedule.cron),
        },
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Schedule not found") {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      console.error("Update schedule error:", err);
      res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // DELETE /api/schedules/:id
  router.delete("/:id", (req: Request, res: Response) => {
    try {
      deleteSchedule(req.params.id as string);
      res.json({ message: "Schedule deleted" });
    } catch (err) {
      if (err instanceof Error && err.message === "Schedule not found") {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }
      console.error("Delete schedule error:", err);
      res.status(500).json({ error: "Failed to delete schedule" });
    }
  });

  // POST /api/schedules/:id/run — manually trigger
  router.post("/:id/run", async (req: Request, res: Response) => {
    try {
      const schedules = loadSchedules();
      const schedule = schedules.find((s) => s.id === (req.params.id as string));
      if (!schedule) {
        res.status(404).json({ error: "Schedule not found" });
        return;
      }

      // Execute in background, respond immediately
      executeScheduledTask(schedule, io).catch((err) => {
        console.error(`Manual run failed for "${schedule.name}":`, err);
      });

      res.json({ message: "Schedule triggered" });
    } catch (err) {
      console.error("Run schedule error:", err);
      res.status(500).json({ error: "Failed to run schedule" });
    }
  });

  return router;
}
