import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "./lib/prisma.js";
import { AGENT_ROLE_PROMPTS } from "@slock/shared";

async function seed() {
  console.log("Seeding database...");

  // Create admin user
  const passwordHash = await bcrypt.hash("admin123", 10);
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      email: "admin@slock.local",
      passwordHash,
    },
  });
  console.log(`Created admin user: ${admin.username}`);

  // Create #general channel
  let general = await prisma.channel.findFirst({ where: { name: "general" } });
  if (!general) {
    general = await prisma.channel.create({
      data: {
        name: "general",
        description: "General discussion for the whole team",
        type: "public",
      },
    });
  }
  console.log(`Created #general channel`);

  // Add admin to general
  await prisma.channelMember.upsert({
    where: {
      userId_channelId: { userId: admin.id, channelId: general.id },
    },
    update: {},
    create: {
      userId: admin.id,
      channelId: general.id,
      role: "admin",
    },
  });

  // Create agents
  const agents = [
    {
      name: "ProductBot",
      role: "product_manager",
      description: "Product Manager AI - helps define requirements, write user stories, and prioritize features",
      systemPrompt: AGENT_ROLE_PROMPTS.product_manager,
      avatar: null,
    },
    {
      name: "DesignBot",
      role: "designer",
      description: "UI/UX Designer AI - focuses on user experience, visual design, and interaction patterns",
      systemPrompt: AGENT_ROLE_PROMPTS.designer,
      avatar: null,
    },
    {
      name: "AnalystBot",
      role: "analyst",
      description: "Data Analyst AI - analyzes information, identifies patterns, and provides insights",
      systemPrompt: AGENT_ROLE_PROMPTS.analyst,
      avatar: null,
    },
  ];

  for (const agentData of agents) {
    const existing = await prisma.agentConfig.findFirst({
      where: { name: agentData.name },
    });

    const agent = existing
      ? existing
      : await prisma.agentConfig.create({
          data: {
            name: agentData.name,
            role: agentData.role,
            description: agentData.description,
            systemPrompt: agentData.systemPrompt,
            capabilities: JSON.stringify(["chat", "analyze", "recommend", "auto_respond"]),
            tools: JSON.stringify([]),
          },
        });

    // Add agent to general channel
    await prisma.channelAgent.upsert({
      where: {
        channelId_agentId: { channelId: general.id, agentId: agent.id },
      },
      update: {},
      create: {
        channelId: general.id,
        agentId: agent.id,
      },
    });

    console.log(`Created agent: ${agent.name} (${agent.role})`);
  }

  console.log("Seed completed!");
}

seed()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
