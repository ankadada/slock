import type { UIComponent } from "@slock/shared";

export interface SkillResult {
  success: boolean;
  text: string;
  uiComponent?: UIComponent;
}

export interface SkillContext {
  agentId: string;
  channelId: string;
  provider: string;
  model: string;
}

export type SkillExecutor = (
  args: Record<string, unknown>,
  context: SkillContext
) => Promise<SkillResult>;

const registry = new Map<string, SkillExecutor>();

export function registerSkill(key: string, executor: SkillExecutor): void {
  registry.set(key, executor);
}

export async function executeSkill(
  key: string,
  args: Record<string, unknown>,
  context: SkillContext
): Promise<SkillResult> {
  const executor = registry.get(key);
  if (!executor) {
    return {
      success: false,
      text: `Unknown skill executor: "${key}". Available: ${[...registry.keys()].join(", ")}`,
    };
  }
  try {
    return await executor(args, context);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, text: `Skill "${key}" failed: ${message}` };
  }
}

export function getRegisteredSkills(): string[] {
  return [...registry.keys()];
}
