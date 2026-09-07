import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
	EaLike,
	ExcalidrawSidepanelTabLike,
	RawExcalidrawElement,
} from "../src/adapter/excalidraw-types.js";
import { createLayerManagerRuntime } from "../src/main.js";
import {
	FakeDocument,
	type FakeDomElement,
	flattenElements,
	flushAsync,
} from "./sidepanelTestHarness.js";

interface RuntimeFixture {
	readonly ea: EaLike;
	readonly tab: ExcalidrawSidepanelTabLike;
	readonly contentEl: FakeDomElement;
	readonly createSidepanelTab: ReturnType<typeof vi.fn>;
	readonly staleWorkspaceCallbacks: readonly (() => void)[];
	readonly getStaleSceneCallback: () =>
		| ((
				elements: readonly RawExcalidrawElement[],
				appState: unknown,
				files: unknown,
		  ) => void)
		| null;
	readonly switchWorkspace: (kind: "excalidraw" | "markdown") => void;
	readonly liveView: Record<string, unknown>;
}

const makeRuntimeFixture = (document: FakeDocument): RuntimeFixture => {
	const contentEl = document.createElement("div");
	const elements: RawExcalidrawElement[] = [
		{
			id: "A",
			type: "rectangle",
			groupIds: [],
			frameId: null,
			opacity: 100,
			locked: false,
			isDeleted: false,
			customData: {
				lmx: {
					label: "Alpha",
				},
			},
		},
	];

	let workspaceKind: "excalidraw" | "markdown" = "excalidraw";
	const workspaceListeners = new Map<string, Set<() => void>>();
	const staleWorkspaceCallbacks: (() => void)[] = [];
	let sceneCallback:
		| ((
				elements: readonly RawExcalidrawElement[],
				appState: unknown,
				files: unknown,
		  ) => void)
		| null = null;

	const workspace = {
		on: (eventName: string, callback: () => void) => {
			let callbacks = workspaceListeners.get(eventName);
			if (!callbacks) {
				callbacks = new Set();
				workspaceListeners.set(eventName, callbacks);
			}
			callbacks.add(callback);
			staleWorkspaceCallbacks.push(callback);
			return { eventName, callback };
		},
		offref: (ref: unknown) => {
			if (!ref || typeof ref !== "object") {
				return;
			}
			const eventName = (ref as { eventName?: unknown }).eventName;
			const callback = (ref as { callback?: unknown }).callback;
			if (typeof eventName === "string" && typeof callback === "function") {
				workspaceListeners.get(eventName)?.delete(callback as () => void);
			}
		},
		getActiveFile: () => ({
			path: workspaceKind === "excalidraw" ? "A.excalidraw.md" : "plain.md",
		}),
		get activeLeaf() {
			return {
				id: "leaf-A",
				view: {
					file: {
						path:
							workspaceKind === "excalidraw" ? "A.excalidraw.md" : "plain.md",
					},
					getViewType: () =>
						workspaceKind === "excalidraw" ? "excalidraw" : "markdown",
				},
			};
		},
	};

	const metadataCache = {
		getFileCache: (file: unknown) => {
			const path =
				file &&
				typeof file === "object" &&
				typeof (file as { path?: unknown }).path === "string"
					? (file as { path: string }).path
					: null;
			return {
				frontmatter:
					path === "A.excalidraw.md"
						? {
								"excalidraw-plugin": "parsed",
							}
						: {},
			};
		},
	};

	const app = {
		workspace,
		metadataCache,
	};

	const liveView = {
		id: "view-A",
		_loaded: true,
		file: {
			path: "A.excalidraw.md",
		},
		leaf: {
			id: "leaf-A",
		},
		app,
	};

	const tab: ExcalidrawSidepanelTabLike = {
		contentEl: contentEl as unknown as HTMLElement,
		setTitle: vi.fn(),
		open: vi.fn(),
		close: vi.fn(),
		onOpen: vi.fn(),
		onFocus: vi.fn(),
		onClose: vi.fn(),
		onExcalidrawViewClosed: vi.fn(),
		onWindowMigrated: vi.fn(),
	};

	const ea: EaLike = {
		app,
		targetView: liveView,
		setView: vi.fn(function (this: EaLike, viewArg?: unknown) {
			if (viewArg === "active" || viewArg === undefined) {
				this.targetView = workspaceKind === "excalidraw" ? liveView : null;
			} else {
				this.targetView = viewArg ?? null;
			}
			return this.targetView;
		}),
		getViewElements: () => (ea.targetView ? elements : []),
		getViewSelectedElements: () => [],
		getScriptSettings: () => ({}),
		getExcalidrawAPI: () => ({
			updateScene: vi.fn(),
			onChange: (callback) => {
				sceneCallback = callback;
				return () => {
					if (sceneCallback === callback) {
						sceneCallback = null;
					}
				};
			},
		}),
		sidepanelTab: null,
	};

	tab.getHostEA = () => ea;

	const createSidepanelTab = vi.fn(() => {
		ea.sidepanelTab = tab;
		return tab;
	});
	ea.createSidepanelTab = createSidepanelTab;

	return {
		ea,
		tab,
		contentEl,
		createSidepanelTab,
		staleWorkspaceCallbacks,
		getStaleSceneCallback: () => sceneCallback,
		switchWorkspace: (kind) => {
			workspaceKind = kind;
		},
		liveView,
	};
};

const hasText = (root: FakeDomElement, text: string): boolean => {
	return flattenElements(root).some((element) => element.textContent === text);
};

describe("runtime sidepanel lifecycle contract", () => {
	const globalRecord = globalThis as Record<string, unknown>;
	let hadDocumentProperty = false;
	let previousDocumentValue: unknown;
	let fakeDocument: FakeDocument;

	beforeEach(() => {
		hadDocumentProperty = Object.prototype.hasOwnProperty.call(
			globalRecord,
			"document",
		);
		previousDocumentValue = globalRecord["document"];
		fakeDocument = new FakeDocument();
		globalRecord["document"] = fakeDocument as unknown as Document;
	});

	afterEach(() => {
		if (hadDocumentProperty) {
			globalRecord["document"] = previousDocumentValue;
		} else {
			Reflect.deleteProperty(globalRecord, "document");
		}
	});

	it("keeps user close terminal under stale workspace and scene callbacks", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		globalRecord["excalidrawLayerManagerRuntime"] = runtime;
		await flushAsync(10);

		expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1);
		expect(fixture.contentEl.children.length).toBeGreaterThan(0);

		const staleSceneCallback = fixture.getStaleSceneCallback();
		fixture.tab.onClose?.();
		await flushAsync(6);

		for (const callback of fixture.staleWorkspaceCallbacks) {
			callback();
		}
		staleSceneCallback?.([], {}, {});
		await flushAsync(10);

		expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1);
		expect(fixture.contentEl.children).toHaveLength(0);
		await expect(runtime.apply({ elementPatches: [] })).rejects.toThrow(
			"Layer Manager runtime disposed.",
		);
		expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined();
	});

	it("moves through unbound and live states via onFocus without rerunning", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		globalRecord["excalidrawLayerManagerRuntime"] = runtime;
		await flushAsync(10);

		expect(hasText(fixture.contentEl, "Alpha")).toBe(true);

		fixture.switchWorkspace("markdown");
		fixture.tab.onFocus?.(null);
		await flushAsync(10);

		expect(hasText(fixture.contentEl, "Layer Manager inactive")).toBe(true);
		expect(hasText(fixture.contentEl, "Alpha")).toBe(false);

		fixture.switchWorkspace("excalidraw");
		fixture.tab.onFocus?.(fixture.liveView);
		await flushAsync(10);

		expect(fixture.createSidepanelTab).toHaveBeenCalledTimes(1);
		expect(hasText(fixture.contentEl, "Alpha")).toBe(true);

		runtime.dispose();
		if (globalRecord["excalidrawLayerManagerRuntime"] === runtime) {
			Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime");
		}
	});

	it("treats associated view closure as non-terminal context loss", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		globalRecord["excalidrawLayerManagerRuntime"] = runtime;
		await flushAsync(10);

		fixture.switchWorkspace("markdown");
		fixture.tab.onExcalidrawViewClosed?.();
		await flushAsync(10);

		expect(fixture.tab.close).not.toHaveBeenCalled();
		expect(hasText(fixture.contentEl, "Layer Manager inactive")).toBe(true);

		fixture.switchWorkspace("excalidraw");
		fixture.tab.onFocus?.(fixture.liveView);
		await flushAsync(10);

		expect(hasText(fixture.contentEl, "Alpha")).toBe(true);
		runtime.dispose();
		if (globalRecord["excalidrawLayerManagerRuntime"] === runtime) {
			Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime");
		}
	});

	it("closes its own runtime without looking up or disposing another global runtime", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const otherRuntime = { dispose: vi.fn(), refresh: vi.fn() };
		globalRecord["excalidrawLayerManagerRuntime"] = otherRuntime;
		const runtime = createLayerManagerRuntime(fixture.ea);
		await flushAsync(10);
		try {
			fixture.tab.onClose?.();
			await flushAsync(10);
			expect(otherRuntime.dispose).not.toHaveBeenCalled();
			expect(globalRecord["excalidrawLayerManagerRuntime"]).toBe(otherRuntime);
			expect(fixture.contentEl.children).toHaveLength(0);
			await expect(runtime.apply({ elementPatches: [] })).rejects.toThrow(
				"disposed",
			);
		} finally {
			runtime.dispose();
			Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime");
		}
	});

	it("does not reacquire a drawing after onFocus(null) while workspace information is stale", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		try {
			await flushAsync(10);
			fixture.tab.onFocus?.(null);
			runtime.refresh();
			for (const callback of fixture.staleWorkspaceCallbacks) callback();
			await flushAsync(10);
			expect(fixture.ea.targetView).toBeNull();
			expect(hasText(fixture.contentEl, "Alpha")).toBe(false);
			fixture.tab.onFocus?.(fixture.liveView);
			await flushAsync(10);
			expect(hasText(fixture.contentEl, "Alpha")).toBe(true);
		} finally {
			runtime.dispose();
		}
	});

	it("explicit disposal clears only its own global reference", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		globalRecord["excalidrawLayerManagerRuntime"] = runtime;
		runtime.dispose();
		expect(globalRecord["excalidrawLayerManagerRuntime"]).toBeUndefined();
		const replacement = { dispose: vi.fn(), refresh: vi.fn() };
		globalRecord["excalidrawLayerManagerRuntime"] = replacement;
		runtime.dispose();
		expect(globalRecord["excalidrawLayerManagerRuntime"]).toBe(replacement);
		Reflect.deleteProperty(globalRecord, "excalidrawLayerManagerRuntime");
	});

	it("retained workspace callbacks do not rebind the EA after disposal", async () => {
		const fixture = makeRuntimeFixture(fakeDocument);
		const runtime = createLayerManagerRuntime(fixture.ea);
		runtime.dispose();
		fixture.ea.targetView = null;
		const setView = vi.mocked(fixture.ea.setView!);
		setView.mockClear();
		for (const callback of fixture.staleWorkspaceCallbacks) callback();
		await flushAsync(10);
		expect(setView).not.toHaveBeenCalled();
		expect(fixture.ea.targetView).toBeNull();
	});
});
