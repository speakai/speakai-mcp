// Runs the real served card script on a recording DOM so a file name with HTML in it can never become markup.
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { MEDIA_LIST_CARD_HTML } from "../src/ui/media-list/view.js";
import { MEDIA_LIST_CARD_META_KEY, type MediaListCard } from "../src/ui/media-list/card-data.js";

const HOSTILE = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;

class FakeNode {
  children: FakeNode[] = [];
  attrs: Record<string, string> = {};
  className = "";
  hidden = false;
  href = "";
  style = { setProperty() {}, padding: "" };
  classList = { add() {} };
  private text = "";

  constructor(readonly tag: string, private readonly htmlSinks: string[]) {}

  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join("");
  }
  set textContent(value: string) {
    this.children = [];
    this.text = String(value);
  }
  set innerHTML(value: string) {
    this.htmlSinks.push(`innerHTML=${value}`);
  }
  set outerHTML(value: string) {
    this.htmlSinks.push(`outerHTML=${value}`);
  }
  insertAdjacentHTML(_where: string, value: string) {
    this.htmlSinks.push(`insertAdjacentHTML=${value}`);
  }
  appendChild(child: FakeNode) {
    this.children.push(child);
    return child;
  }
  setAttribute(name: string, value: string) {
    this.attrs[name] = String(value);
  }
  getAttribute(name: string) {
    return this.attrs[name] ?? null;
  }
  removeAttribute(name: string) {
    delete this.attrs[name];
  }
  addEventListener() {}
  getBoundingClientRect() {
    return { height: 0 };
  }
  all(): FakeNode[] {
    return [this, ...this.children.flatMap((child) => child.all())];
  }
}

function renderCard(card: MediaListCard) {
  const htmlSinks: string[] = [];
  const make = (tag: string) => new FakeNode(tag, htmlSinks);
  const root = make("main");
  let onMessage: ((event: unknown) => void) | undefined;
  const window: Record<string, unknown> = {
    postMessage() {},
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (type === "message") onMessage = fn;
    },
    open() {},
  };
  window.parent = window;
  const document = {
    getElementById: () => root,
    createElement: make,
    createTextNode: (text: string) => Object.assign(make("#text"), { textContent: text }),
    documentElement: Object.assign(make("html"), { lang: "en-GB" }),
    body: make("body"),
    write: (value: string) => htmlSinks.push(`document.write=${value}`),
  };

  const script = MEDIA_LIST_CARD_HTML.match(/<script>([\s\S]*)<\/script>/)![1];
  vm.runInNewContext(script, {
    window,
    document,
    navigator: { language: "en-GB" },
    setTimeout: () => 0,
    clearTimeout: () => {},
  });
  expect(onMessage).toBeTypeOf("function");
  onMessage!({
    source: window,
    data: { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: { _meta: { [MEDIA_LIST_CARD_META_KEY]: card } } },
  });

  const nodes = root.all();
  return { root, htmlSinks, nodes, links: nodes.filter((node) => node.tag === "a") };
}

describe("file list card view", () => {
  it("shows a hostile file name and search line as text, never as markup", () => {
    const { root, htmlSinks, nodes } = renderCard({
      source: "search_media",
      total: 1,
      query: HOSTILE,
      items: [{ mediaId: "m1", name: HOSTILE, matchLine: HOSTILE, state: "processed" }],
    });

    expect(htmlSinks).toEqual([]);
    expect(nodes.map((node) => node.tag).filter((tag) => tag === "img" || tag === "script")).toEqual([]);
    expect(root.textContent).toContain(HOSTILE);
    expect(root.textContent.split(HOSTILE).length - 1).toBe(3);
  });

  it("keeps every link on the Speak web app, with the media id encoded", () => {
    const mediaId = `x"/../../evil?<b>`;
    const { links } = renderCard({ source: "list_media", total: 1, items: [{ mediaId, name: "Call" }] });

    expect(links.map((link) => link.href)).toEqual([`https://app.speakai.co/media/${encodeURIComponent(mediaId)}`]);
  });
});
