/**
 * Skills module entry point.
 * Import this file to register all skill executors.
 */

// Import all executor files to trigger their registerSkill calls
import "./executors/engineer-skills.js";
import "./executors/analyst-skills.js";
import "./executors/designer-skills.js";
import "./executors/product-skills.js";
import "./executors/generic-executor.js";

// Re-export registry functions
export { executeSkill, getRegisteredSkills } from "./skill-registry.js";
export type { SkillResult, SkillContext, SkillExecutor } from "./skill-registry.js";

// Re-export conversion utilities
export { convertToAnthropicTools, convertToOpenAITools } from "./convert-tools.js";

// Re-export presets
export { PRESET_TOOL_DEFINITIONS } from "./preset-skills.js";
