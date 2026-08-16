window.__ModuleLoader__.load({
	id: "@graysilver/dsh-task-modes",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/index.tsx
		const modes = [
			{
				id: "normal",
				key: "normal"
			},
			{
				id: "first-principles",
				key: "firstPrinciples"
			},
			{
				id: "adversarial-review",
				key: "review"
			}
		];
		/** Required browser services for the task-mode controls. */
		const inject = [
			"slots",
			"locale",
			"remote"
		];
		const triggerStyle = {
			alignItems: "center",
			background: "transparent",
			border: 0,
			borderRadius: 6,
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer",
			display: "inline-flex",
			fontSize: 13,
			gap: 4,
			height: 28,
			padding: "0 6px 0 8px"
		};
		const reviewStyle = {
			background: "var(--dsw-alias-bg-module-platform)",
			borderRadius: 6,
			boxSizing: "border-box",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 13,
			lineHeight: "20px",
			padding: "8px 12px",
			width: "100%"
		};
		const reviewSummaryStyle = {
			alignItems: "center",
			cursor: "pointer",
			display: "flex",
			fontWeight: 500,
			gap: 6
		};
		function TaskModeControl({ getMode, setMode, t }) {
			const [mode, setCurrent] = (0, react.useState)("normal");
			const [open, setOpen] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				getMode().then(setCurrent).catch(() => {});
			}, [getMode]);
			const selected = modes.find((item) => item.id === mode) ?? modes[0];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
				open,
				onClose: () => {
					setOpen(false);
				},
				items: modes.map((item) => ({
					id: item.id,
					label: t(item.key),
					icon: item.id === "normal" ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, {})
				})),
				selectedId: mode,
				onSelect: (id) => {
					if (id !== "normal" && id !== "first-principles" && id !== "adversarial-review") return;
					setOpen(false);
					setBusy(true);
					setMode(id).then(() => setCurrent(id)).finally(() => setBusy(false));
				},
				side: "top",
				anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: triggerStyle,
					disabled: busy,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(selected.key) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, {})]
				})
			});
		}
		function ReviewDock({ reviews, t }) {
			const [text, setText] = (0, react.useState)(void 0);
			(0, react.useEffect)(() => {
				let live = true;
				reviews().then((value) => {
					if (live) setText(value);
				}).catch(() => {
					if (live) setText("");
				});
				return () => {
					live = false;
				};
			}, [reviews]);
			if (text === void 0 || text === "") return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
				style: reviewStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", {
					style: reviewSummaryStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconThinkOutline14, {}),
						" ",
						t("review")
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MarkdownText, { text })]
			});
		}
		const en = {
			normal: "Normal",
			firstPrinciples: "First principles",
			review: "Adversarial review"
		};
		const zh = {
			normal: "普通",
			firstPrinciples: "第一性原理",
			review: "对抗式审查"
		};
		/** Mount the task-mode selector and persisted review history for Web profiles. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register("taskModes", {
				en,
				zh
			}), "dsh-task-modes: locale");
			const execute = async (sessionId, line) => {
				const response = await ctx.remote.commands.execute(sessionId, line);
				if (!response.ok) throw new Error(response.error.message);
				return response.value?.result.text ?? "";
			};
			const faceFor = (sessionId) => ({
				getMode: async () => {
					const mode = (await execute(sessionId, "/task-mode")).slice(11);
					return mode === "first-principles" || mode === "adversarial-review" ? mode : "normal";
				},
				setMode: async (mode) => {
					await execute(sessionId, `/task-mode ${mode}`);
				},
				reviews: async () => await execute(sessionId, "/task-mode reviews")
			});
			ctx.slots.inject("conversation.input.left", () => ctx.slots.register({
				name: "conversation.input.left",
				id: "task-modes",
				locale: "taskModes",
				inject: faceFor
			}, TaskModeControl));
			ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
				name: "conversation.input.dock",
				id: "task-mode-reviews",
				order: 25,
				locale: "taskModes",
				inject: (sessionId) => ({ reviews: faceFor(sessionId).reviews })
			}, ReviewDock));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
