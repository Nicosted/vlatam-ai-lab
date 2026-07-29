import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { describe, it } from "node:test";

import {
  APPLICATION_SHELL_CSS,
  APPLICATION_SHELL_JS,
  renderApplicationShell,
} from "../../src/application/application-shell.js";

type Listener = (event: FakeEvent) => void;

class FakeEvent {
  defaultPrevented = false;
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;

  constructor(
    readonly type: string,
    options: Partial<
      Pick<FakeEvent, "key" | "shiftKey" | "metaKey" | "ctrlKey">
    > = {},
  ) {
    this.key = options.key ?? "";
    this.shiftKey = options.shiftKey ?? false;
    this.metaKey = options.metaKey ?? false;
    this.ctrlKey = options.ctrlKey ?? false;
  }

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

class FakeClassList {
  private readonly values = new Set<string>();

  toggle(value: string, force?: boolean): void {
    if (force === false) this.values.delete(value);
    else if (force === true) this.values.add(value);
    else if (this.values.has(value)) this.values.delete(value);
    else this.values.add(value);
  }

  contains(value: string): boolean {
    return this.values.has(value);
  }
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly listeners = new Map<string, Listener[]>();
  readonly attributes = new Map<string, string>();
  hidden = false;
  inert = false;
  value = "";
  textContent = "";
  focusables: FakeElement[] = [];

  constructor(
    readonly name: string,
    private readonly owner: { activeElement: FakeElement | null },
  ) {}

  addEventListener(type: string, listener: Listener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatchEvent(event: FakeEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? [])
      listener(event);
    return !event.defaultPrevented;
  }

  click(): void {
    this.dispatchEvent(new FakeEvent("click"));
  }

  focus(): void {
    this.owner.activeElement = this;
  }

  blur(): void {
    if (this.owner.activeElement === this) this.owner.activeElement = null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  querySelectorAll(): FakeElement[] {
    return this.focusables;
  }
}

function browserHarness() {
  const state: { activeElement: FakeElement | null } = { activeElement: null };
  const shell = new FakeElement("shell", state);
  const drawer = new FakeElement("drawer", state);
  const sidebarToggle = new FakeElement("sidebar-toggle", state);
  const mobileToggle = new FakeElement("mobile-toggle", state);
  const mobileClose = new FakeElement("mobile-close", state);
  const scrim = new FakeElement("scrim", state);
  const search = new FakeElement("search", state);
  const firstRoute = new FakeElement("first-route", state);
  const lastRoute = new FakeElement("last-route", state);
  drawer.focusables = [mobileClose, firstRoute, lastRoute];

  const documentListeners = new Map<string, Listener[]>();
  const selectorMap = new Map<string, FakeElement>([
    ["[data-shell]", shell],
    ["[data-mobile-drawer]", drawer],
    ["[data-sidebar-toggle]", sidebarToggle],
    ["[data-mobile-toggle]", mobileToggle],
    ["[data-mobile-close]", mobileClose],
    ["[data-mobile-scrim]", scrim],
    ["[data-command-search]", search],
  ]);
  const body = new FakeElement("body", state);
  const document = {
    body,
    get activeElement() {
      return state.activeElement;
    },
    querySelector(selector: string) {
      return selectorMap.get(selector) ?? null;
    },
    querySelectorAll(selector: string) {
      if (selector === "[data-shell-route]") return [firstRoute, lastRoute];
      return [];
    },
    getElementById() {
      return null;
    },
    addEventListener(type: string, listener: Listener) {
      const listeners = documentListeners.get(type) ?? [];
      listeners.push(listener);
      documentListeners.set(type, listeners);
    },
    dispatch(event: FakeEvent) {
      for (const listener of documentListeners.get(event.type) ?? [])
        listener(event);
    },
  };
  const mediaListeners: Listener[] = [];
  const window = {
    matchMedia(query: string) {
      assert.equal(query, "(max-width:820px)");
      return {
        matches: true,
        addEventListener(type: string, listener: Listener) {
          if (type === "change") mediaListeners.push(listener);
        },
      };
    },
  };
  runInNewContext(APPLICATION_SHELL_JS, {
    document,
    window,
    Event: FakeEvent,
  });
  return {
    body,
    document,
    drawer,
    firstRoute,
    lastRoute,
    mobileClose,
    mobileToggle,
    scrim,
    shell,
  };
}

describe("AI-134 mobile application drawer at 390x844", () => {
  it("starts hidden and inert, then traps focus while open", () => {
    const browser = browserHarness();
    assert.equal(browser.drawer.getAttribute("aria-hidden"), "true");
    assert.equal(browser.drawer.inert, true);
    assert.equal(browser.mobileToggle.getAttribute("aria-expanded"), "false");

    browser.mobileToggle.focus();
    browser.mobileToggle.click();
    assert.equal(browser.shell.dataset.mobileOpen, "true");
    assert.equal(browser.drawer.getAttribute("aria-hidden"), "false");
    assert.equal(browser.drawer.inert, false);
    assert.equal(browser.mobileToggle.getAttribute("aria-expanded"), "true");
    assert.equal(browser.document.activeElement, browser.mobileClose);
    assert.equal(browser.body.classList.contains("mobile-drawer-open"), true);

    browser.lastRoute.focus();
    const forwardTab = new FakeEvent("keydown", { key: "Tab" });
    browser.document.dispatch(forwardTab);
    assert.equal(forwardTab.defaultPrevented, true);
    assert.equal(browser.document.activeElement, browser.mobileClose);

    browser.mobileClose.focus();
    const reverseTab = new FakeEvent("keydown", {
      key: "Tab",
      shiftKey: true,
    });
    browser.document.dispatch(reverseTab);
    assert.equal(reverseTab.defaultPrevented, true);
    assert.equal(browser.document.activeElement, browser.lastRoute);
  });

  it("closes by Escape, backdrop, and route selection and restores focus", () => {
    const browser = browserHarness();
    for (const close of [
      () =>
        browser.document.dispatch(new FakeEvent("keydown", { key: "Escape" })),
      () => browser.scrim.click(),
      () => browser.firstRoute.click(),
    ]) {
      browser.mobileToggle.focus();
      browser.mobileToggle.click();
      assert.equal(browser.shell.dataset.mobileOpen, "true");
      close();
      assert.equal(browser.shell.dataset.mobileOpen, "false");
      assert.equal(browser.drawer.inert, true);
      assert.equal(browser.drawer.getAttribute("aria-hidden"), "true");
      assert.equal(browser.document.activeElement, browser.mobileToggle);
      assert.equal(
        browser.body.classList.contains("mobile-drawer-open"),
        false,
      );
    }
  });

  it("keeps environment, blocked state, identity, and kill switches visible", () => {
    const html = renderApplicationShell({
      pathname: "/operator",
      identity: {
        authenticated: true,
        display_name: "Operador móvil",
        subject: "test:mobile",
        role: "operator",
        source: "trusted-upstream",
      },
      deployment_environment: "preview",
      evaluated_at: "2026-07-24T00:00:00.000Z",
      read_model_hash: "abcdef0123456789",
      overall_status: "blocked",
      content: "<h2>Centro de misiones</h2>",
    });
    assert.match(APPLICATION_SHELL_CSS, /@media\(max-width:820px\)/);
    assert.match(
      APPLICATION_SHELL_CSS,
      /\.mobile-context\{width:100%;display:flex/,
    );
    assert.match(
      APPLICATION_SHELL_CSS,
      /\.arca-regulation-card__header\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;align-items:start;gap:12px;min-height:126px/,
    );
    assert.match(
      APPLICATION_SHELL_CSS,
      /@media\(max-width:1120px\)\{[\s\S]*?\.arca-regulation-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    );
    assert.match(
      APPLICATION_SHELL_CSS,
      /@media\(max-width:820px\)\{[\s\S]*?\.arca-regulation-card__header\{grid-template-columns:1fr;min-height:0\}[\s\S]*?\.arca-regulation-card__status\{justify-self:start\}/,
    );
    assert.match(
      APPLICATION_SHELL_CSS,
      /\.official-source-link\{display:inline-flex;align-items:center;min-height:34px/,
    );
    assert.match(
      html,
      /data-mobile-drawer aria-hidden="true" inert aria-label=/,
    );
    assert.match(html, /mobile-context/);
    assert.match(html, /VISTA PREVIA/);
    assert.match(html, /Sistema bloqueado/);
    assert.match(html, /Operador móvil · OPERADOR/);
    assert.match(
      html,
      /Interruptores de seguridad AI-131\/132\/133 activos · solo lectura/,
    );
  });
});
