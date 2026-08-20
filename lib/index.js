/**
 * Debug Mode host half: registers the runtime-first `debug-mode` skill and an
 * optional `/debug` command. The command queues the pinned activation context
 * for the next real user turn without waking the model; the browser half turns
 * its local success acknowledgment into the dock UI.
 * Continue and fixed remain model-visible messages; Exit submits a Host-owned
 * control message that deactivates the process-local phase before any model request.
 * @module dsh-debug-mode
 */
import { fileURLToPath } from 'node:url';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { renderSkillContent } from '@deepseek-ai/dsh-skill';
import { DEBUG_MODE_COMMAND } from "./messages.js";
import { installDebugModeRuntime } from "./runtime.js";
import { debugModeSkill } from "./skill.js";
/** Test seam over the installed scripts-directory resolver. */
export const internals = {
    resolveResourceBase: () => fileURLToPath(new URL('../scripts/', import.meta.url)),
};
/** Cordis plugin name. */
export const name = 'debug-mode';
/** Hard dependency: this plugin exists only to contribute the skill. */
export const inject = ['llm', 'sessions', 'skills', 'tools'];
export { DEBUG_MODE_COMMAND } from "./messages.js";
/**
 * Register the debug-mode skill as a lifecycle-owned effect.
 * @param ctx - host context carrying the skill registry.
 */
export function apply(ctx) {
    const skill = debugModeSkill(internals.resolveResourceBase());
    const activationContext = renderSkillContent({
        ...skill,
        provider: skill.provider ?? 'runtime',
    });
    ctx.effect(() => ctx.skills.register(skill), 'debug-mode: skill');
    const runtime = installDebugModeRuntime(ctx);
    ctx.inject(['commands'], (commandCtx) => {
        commandCtx.commands.register({
            name: DEBUG_MODE_COMMAND,
            description: 'Start Debug Mode',
            handler: async ({ agent }) => {
                if (agent.status !== 'idle') {
                    return { kind: 'error', text: 'Debug Mode can start only while the agent is idle' };
                }
                runtime.activate(agent);
                agent.inject(createUserMessage({
                    content: [{ type: 'text', text: activationContext }],
                    source: { kind: 'plugin', plugin: 'debug-mode' },
                }));
                return { kind: 'success', sourceEventSeq: agent.session.seq };
            },
        });
    });
}
