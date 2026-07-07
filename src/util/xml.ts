// idml's own lightweight XML layer — replaces the parts of `flat-svg` idml used,
// with ZERO heavy/native deps. The browser path uses the platform's native
// `DOMParser`; Node uses `linkedom` (pure-JS, full CSS-selector + `.children`
// support, no canvas/jsdom), loaded lazily so a browser bundle never pulls it in.
//
// Two representations live here:
//  - PARSING yields native DOM `Element`s (what every controller reads via
//    `getAttribute` / `getElementsByTagName` / `querySelector` / `.children`).
//  - SERIALIZING uses the plain `XMLNode` object tree (`makeElementNode` etc.)
//    that the controllers' `serialize()` methods build, stringified by
//    `stringifyXML` for the IDML-write path.

const isNode = typeof window === 'undefined';

// Node DOMParser (linkedom), cached after preloadDOM(). Kept `any` so this file
// carries no type dependency on linkedom (which is a Node-only, lazy import).
let NodeDOMParser: (new () => { parseFromString(src: string, type: string): Document }) | undefined;

/**
 * Prepare the XML parser. No-op in the browser (native `DOMParser` is always
 * there); in Node it lazily loads `linkedom` and caches its `DOMParser` so the
 * synchronous `parseXML`/`parseDOM` below can run. The IDML constructor awaits
 * this before parsing, so call sites stay synchronous.
 */
export async function preloadDOM(): Promise<void> {
  if (isNode && !NodeDOMParser) {
    // @vite-ignore — Node-only; a browser build never reaches this branch and
    // must not bundle linkedom.
    NodeDOMParser = (await import(/* @vite-ignore */ 'linkedom')).DOMParser as unknown as typeof NodeDOMParser;
  }
}
/** @deprecated kept for callers migrating from flat-svg; use {@link preloadDOM}. */
export const preloadJSDOM = preloadDOM;

export function parseDOM(str: string, contentType = 'text/xml'): Document {
  if (isNode) {
    if (!NodeDOMParser) throw new Error('idml: call preloadDOM() (or await the IDML "ready" event) before parsing XML in Node.');
    return new NodeDOMParser().parseFromString(str, contentType);
  }
  return new DOMParser().parseFromString(str, contentType as DOMParserSupportedType);
}

/** Parse an XML string and return its root element. */
export function parseXML(str: string): HTMLElement {
  return parseDOM(str, 'text/xml').documentElement as HTMLElement;
}

// ---------------------------------------------------------------------------
// Serialization node model + builders (unchanged surface from flat-svg)
// ---------------------------------------------------------------------------

export type XMLDocumentExport = { root: ElementNode; src: string };
export type XMLProcessingInstruction = { name: string; attributes: { [k: string]: string | number | boolean } };
export const XMLProcessingInstructionXML: XMLProcessingInstruction = { name: 'xml', attributes: { version: '1.0', encoding: 'UTF-8', standalone: 'yes' } };
export const XMLProcessingInstructionAID: XMLProcessingInstruction = { name: 'aid', attributes: { style: 50, type: 'document', readerVersion: '6.0', featureSet: 257, product: '20.0(95)' } };

export type ElementNode = { type: 'element'; tagName: string; attributes?: { [k: string]: string | number | boolean | undefined }; children?: XMLNode[] };
export type TextNode = { type: 'text'; text: string };
export type CDataNode = { type: 'cdata'; data: string };
export type CommentNode = { type: 'comment'; comment: string };
export type XMLNode = ElementNode | TextNode | CDataNode | CommentNode;

export function makeElementNode(tagName: string, attributes?: { [k: string]: string | number | boolean | undefined }, children?: XMLNode[]): ElementNode {
  return { type: 'element', tagName, attributes: Object.fromEntries(Object.entries(attributes ?? {}).filter(([, value]) => value !== undefined)), children };
}
export function makeTextNode(value: string | number | boolean): TextNode {
  return { type: 'text', text: String(value) };
}
export function makeCDataNode(value: string | number | boolean): CDataNode {
  return { type: 'cdata', data: String(value) };
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function isValidTagName(tagName: string): boolean {
  return /^[a-zA-Z_][\w.-]*(:[\w.-]+)?$/.test(tagName);
}

export function stringifyNode(node: XMLNode): string {
  if (node.type === 'element') {
    if (!isValidTagName(node.tagName)) throw new Error(`Invalid tag name: ${node.tagName}`);
    const attrsStr = Object.entries(node.attributes ?? {})
      .map(([key, value]) => `${key}="${escapeAttribute(String(value))}"`)
      .join(' ');
    if (node.children === undefined || node.children.length === 0) return `<${node.tagName} ${attrsStr} />`;
    return `<${node.tagName} ${attrsStr}>${node.children.map(stringifyNode).join('')}</${node.tagName}>`;
  } else if (node.type === 'cdata') {
    return `<![CDATA[${node.data}]]>`;
  } else if (node.type === 'comment') {
    return `<!--${node.comment}-->`;
  }
  return escapeText(node.text);
}

/** Serialize a node tree with leading processing instructions. `pretty` is a
 * best-effort hint (currently a no-op; the write path doesn't require it). */
export function stringifyXML(node: XMLNode, processingInstructions: XMLProcessingInstruction[] = [], _pretty = false): string {
  const pi = processingInstructions.map((p) => `<?${p.name} ${Object.entries(p.attributes).map(([k, v]) => `${k}="${v}"`).join(' ')}?>`).join('\n');
  return (pi ? pi + '\n' : '') + stringifyNode(node);
}

// ---------------------------------------------------------------------------
// DOM (parsed) -> node model conversions
// ---------------------------------------------------------------------------

export function getAttributes(element: Element): { [k: string]: string | undefined } {
  return Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, element.getAttribute(attr.name) ?? undefined]));
}

export function nodeToNode(node: Node): XMLNode {
  if (node.nodeType === 1) {
    const element = node as Element;
    return makeElementNode(
      element.tagName,
      getAttributes(element),
      Array.from(element.childNodes)
        .map(nodeToNode)
        .filter((n) => n !== null)
    );
  } else if (node.nodeType === 3) {
    return makeTextNode((node as Text).textContent ?? '');
  } else if (node.nodeType === 4) {
    return makeCDataNode((node as CDATASection).textContent ?? '');
  } else if (node.nodeType === 8) {
    return { type: 'comment', comment: node.nodeValue ?? '' };
  }
  throw new Error('Unsupported node type: ' + node.nodeType);
}

export function domNodeToXMLNode(node: Node, skipElements: string[]): ElementNode & { children: XMLNode[] } {
  const xmlNode = nodeToNode(node);
  if (xmlNode.type !== 'element') throw new Error('Root node must be an element');
  xmlNode.children = xmlNode.children?.filter((child) => child.type !== 'element' || !skipElements.includes(child.tagName)) ?? [];
  return xmlNode as ElementNode & { children: XMLNode[] };
}

// ---------------------------------------------------------------------------
// Small element/util helpers (were in flat-svg/helpers)
// ---------------------------------------------------------------------------

export function getElementAttributes(element: Element, exclude: string[] = []): { [k: string]: string } {
  return Object.fromEntries(
    Array.from(element.attributes)
      .map((attr) => [attr.name, attr.value])
      .filter(([, value]) => value !== null)
      .filter(([key]) => !exclude.includes(key as string))
  ) as { [k: string]: string };
}

export function getUniqueID(prefix?: string): string {
  const id = Math.random().toString(36).substring(2, 15);
  return prefix ? `${prefix}_${id}` : id;
}
