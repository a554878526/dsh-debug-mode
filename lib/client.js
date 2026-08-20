window.__ModuleLoader__.load({
	id: "dsh-debug-mode",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		/** Requests another evidence-analysis iteration. */
		const DEBUG_MODE_CONTINUE_MESSAGE = "继续分析";
		/** Confirms the fix and requests cleanup of temporary diagnostics. */
		const DEBUG_MODE_FIXED_MESSAGE = "已修复，请清理调试日志和插桩代码";
		/** Cancels the Host-enforced Debug Mode phase without asking the model to respond. */
		const DEBUG_MODE_EXIT_MESSAGE = "退出 Debug Mode";
		//#endregion
		//#region \0dsh-debug-css:DebugModeDock.module.css.mjs
		const css = ".q-JBiq_dock{box-sizing:border-box;width:calc(100% - var(--dsh-composer-side-clearance) - var(--dsh-composer-side-clearance) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset) - var(--dsh-composer-dock-inset));margin:0 auto}.q-JBiq_bar{box-sizing:border-box;width:100%;max-width:calc(var(--dsh-composer-card-max-width) - 4 * var(--dsh-composer-dock-inset));border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-specific-tip);border-radius:12px;align-items:center;gap:10px;min-height:36px;margin:0 auto;padding:4px 5px 4px 12px;display:flex}.q-JBiq_status{color:var(--dsw-alias-state-business-primary);flex:none;font-size:13px;font-weight:500;line-height:24px}.q-JBiq_hint{min-width:0;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:12px;line-height:20px;overflow:hidden}.q-JBiq_continue,.q-JBiq_fixed,.q-JBiq_exit{cursor:pointer;border-radius:6px;flex:none;height:26px;padding:0 12px;font-size:12px;line-height:20px}.q-JBiq_continue{border:1px solid var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary-inverted)}.q-JBiq_continue:disabled{cursor:not-allowed;opacity:.45}.q-JBiq_fixed{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary)}.q-JBiq_fixed:hover{background:var(--dsw-alias-interactive-bg-hover)}.q-JBiq_exit{color:var(--dsw-alias-label-tertiary);background:0 0;border:0}.q-JBiq_exit:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary)}";
		const tagId = "dsh-debug-mode/DebugModeDock.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-debug-mode";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var _dsh_debug_css_DebugModeDock_module_css_default = {
			"bar": "q-JBiq_bar",
			"continue": "q-JBiq_continue",
			"dock": "q-JBiq_dock",
			"exit": "q-JBiq_exit",
			"fixed": "q-JBiq_fixed",
			"hint": "q-JBiq_hint",
			"status": "q-JBiq_status"
		};
		//#endregion
		//#region src/client/DebugModeDock.tsx
		/**
		* Debug Mode dock strip. The local `/debug` acknowledgment opens it; continue
		* advances the model-visible loop, fixed submits cleanup and closes the dock,
		* and exit submits Host deactivation before closing the dock.
		*/
		/**
		* The dock strip.
		* @param props - runtime share (input kit), store share, and locale seat.
		*/
		function DebugModeDock({ useStore, useSession, actions, inputActions, subscribeActivation, t }) {
			const enabled = useStore((state) => state.enabled);
			const activationSeq = useStore((state) => state.activationSeq);
			const consumedWaitingSeq = useStore((state) => state.consumedWaitingSeq);
			const waitingSeq = useSession((snapshot) => {
				if (activationSeq === null) return null;
				let latest = null;
				for (const node of snapshot.nodes) if (node.kind === "assistant" && node.seq > activationSeq && node.blocks.some((block) => block.kind === "text" && block.text.startsWith("Debug Mode is waiting for reproduction."))) latest = latest === null ? node.seq : Math.max(latest, node.seq);
				return latest;
			});
			const waitingForReproduction = waitingSeq !== null && (consumedWaitingSeq === null || waitingSeq > consumedWaitingSeq);
			(0, react.useEffect)(() => subscribeActivation((sourceEventSeq) => {
				actions.activate(sourceEventSeq);
			}), [actions, subscribeActivation]);
			if (!enabled) return null;
			const send = (message) => {
				inputActions.setDraft(message);
				inputActions.submit();
			};
			const continueAnalysis = () => {
				if (waitingSeq === null) return;
				actions.consumeWaiting(waitingSeq);
				send(DEBUG_MODE_CONTINUE_MESSAGE);
			};
			const fixed = () => {
				send(DEBUG_MODE_FIXED_MESSAGE);
				actions.setEnabled(false);
			};
			const exit = () => {
				send(DEBUG_MODE_EXIT_MESSAGE);
				actions.setEnabled(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: _dsh_debug_css_DebugModeDock_module_css_default.dock,
				"data-debug-mode-dock": true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: _dsh_debug_css_DebugModeDock_module_css_default.bar,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_debug_css_DebugModeDock_module_css_default.status,
							children: t("dock.status")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: _dsh_debug_css_DebugModeDock_module_css_default.hint,
							children: t(waitingForReproduction ? "dock.waitingHint" : "dock.setupHint")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_debug_css_DebugModeDock_module_css_default.continue,
							disabled: !waitingForReproduction,
							onClick: continueAnalysis,
							children: t("dock.continue")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_debug_css_DebugModeDock_module_css_default.fixed,
							onClick: fixed,
							children: t("dock.fixed")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: _dsh_debug_css_DebugModeDock_module_css_default.exit,
							onClick: exit,
							children: t("dock.exit")
						})
					]
				})
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/** `debug-mode` namespace dictionaries (UI-visible copy only; submit messages are pinned model text). */
		/** Simplified Chinese dictionary (the key-set source of truth). */
		const zh = {
			"dock.status": "Debug Mode 已开启",
			"dock.setupHint": "正在准备日志与插桩，完成交接后才可继续",
			"dock.waitingHint": "复现后点「继续分析」；确认修复后点「已修复」",
			"dock.continue": "继续分析",
			"dock.fixed": "已修复",
			"dock.exit": "退出"
		};
		/** English dictionary, checked complete against the zh key set. */
		const en = {
			"dock.status": "Debug Mode on",
			"dock.setupHint": "Preparing logs and probes; Continue unlocks after handoff",
			"dock.waitingHint": "Reproduce, then Continue; Fixed when resolved",
			"dock.continue": "Continue",
			"dock.fixed": "Fixed",
			"dock.exit": "Exit"
		};
		//#endregion
		//#region src/client/store.ts
		/**
		* Per-session Debug Mode presentation state for the input-dock strip. The
		* state is transient and never changes the model-visible conversation.
		*/
		/**
		* Declare the per-session Debug Mode state and its write surface.
		* @returns the shared store handle.
		*/
		function createDebugModeStore() {
			return (0, _deepseek_ai_dsh_client_runtime_client.defineStore)({
				init: () => ({
					enabled: false,
					activationSeq: null,
					consumedWaitingSeq: null
				}),
				actions: {
					setEnabled: (draft, enabled) => {
						draft.enabled = enabled;
					},
					activate: (draft, sourceEventSeq) => {
						draft.enabled = true;
						draft.activationSeq = sourceEventSeq;
						draft.consumedWaitingSeq = null;
					},
					consumeWaiting: (draft, waitingSeq) => {
						draft.consumedWaitingSeq = waitingSeq;
					}
				}
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** Dictionary namespace owned by this plugin. */
		const NS = "debug-mode";
		/** Required services: slots, command execution acknowledgments, and copy. */
		const inject = [
			"slots",
			"commandUi",
			"locale"
		];
		/**
		* Client plugin body: register the dictionaries and command-activated dock.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-debug-mode: dictionaries");
			const store = createDebugModeStore();
			const activationListeners = /* @__PURE__ */ new Map();
			ctx.on("command/executed", (sessionId, command, result) => {
				if (command !== "debug" || result.kind !== "success" || result.sourceEventSeq === void 0) return;
				for (const listener of activationListeners.get(sessionId) ?? []) listener(result.sourceEventSeq);
			});
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "debug-mode",
				order: 20,
				locale: NS,
				store,
				inject: (sessionId) => ({ subscribeActivation: (listener) => {
					const listeners = activationListeners.get(sessionId) ?? /* @__PURE__ */ new Set();
					listeners.add(listener);
					activationListeners.set(sessionId, listeners);
					return () => {
						listeners.delete(listener);
						if (listeners.size === 0) activationListeners.delete(sessionId);
					};
				} })
			}, DebugModeDock));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map