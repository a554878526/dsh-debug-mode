/**
 * The `debug-mode` skill body, registered programmatically by the host half.
 * It is the model-facing behavior contract for the runtime-first debug loop:
 * probe first, stop for reproduction evidence, then analyze/fix/cleanup.
 *
 * Packaged scripts are the primary mechanics for session creation, ingest,
 * summarization, and cleanup scans. Inline probe templates remain a fallback
 * for environments where a packaged helper cannot run.
 * @module dsh-debug-mode/src/skill
 */
import type { SkillRegistration } from '@deepseek-ai/dsh-skill';
/** Skill copy: registered once by the host half, disposed with its fiber. */
export declare const DEBUG_MODE_SKILL: SkillRegistration;
/**
 * Bind the runtime skill to this installed plugin's scripts directory.
 * @param scriptsDirectory - absolute directory resolved by the Host entry.
 * @returns registration carrying the directory resource base.
 */
export declare function debugModeSkill(scriptsDirectory: string): SkillRegistration;
