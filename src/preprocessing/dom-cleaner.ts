/**
 * dom-cleaner.ts
 *
 * Processes raw rrweb replay DOM snapshots (HTML strings) for AI analysis.
 * Preserves HTML structure — does NOT convert to plain text.
 *
 * Runs in Cloudflare Workers where there is NO DOM API (no DOMParser,
 * no document). All processing uses string manipulation and regex.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_CHARS = 64000; // ~16K tokens

/** Attributes we explicitly keep on elements. */
const KEPT_ATTRIBUTES = new Set([
  'href',
  'src',
  'alt',
  'title',
  'name',
  'type',
  'value',
  'placeholder',
  'role',
  'id',
  'action',
  'method',
  'for',
]);

/** Max length for any single attribute value before truncation. */
const MAX_ATTR_VALUE_LENGTH = 100;

// ---------------------------------------------------------------------------
// Regex patterns (compiled once, reused across calls)
// ---------------------------------------------------------------------------

/** Match <style>...</style> blocks (including multiline content). */
const STYLE_TAG_RE = /<style\b[^>]*>[\s\S]*?<\/style>/gi;

/** Match <script>...</script> blocks (including multiline content). */
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

/** Match <noscript>...</noscript> blocks. */
const NOSCRIPT_TAG_RE = /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi;

/** Match <link> elements that are stylesheet references. */
const LINK_STYLESHEET_RE = /<link\b[^>]+rel\s*=\s*["']stylesheet["'][^>]*>/gi;

/** Match HTML comments <!-- ... -->. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

/** Match style="..." attributes (single or double quotes, or unquoted). */
const STYLE_ATTR_RE = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Match class="..." attributes. */
const CLASS_ATTR_RE = /\s+class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Match data-*="..." attributes. */
const DATA_ATTR_RE = /\s+data-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Match runs of whitespace (spaces, tabs, newlines). */
const WHITESPACE_COLLAPSE_RE = /\s{2,}/g;

/** Tags considered "interactive" and always preserved during pruning. */
const INTERACTIVE_TAGS = new Set([
  'button',
  'a',
  'input',
  'select',
  'textarea',
  'form',
]);

/** Tags considered "text-bearing" and always preserved during pruning. */
const TEXT_BEARING_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'label',
  'li',
  'td',
  'th',
]);

/** Tags that are semantic containers we keep even if they are wrappers. */
const SEMANTIC_BOUNDARY_TAGS = [
  '</section>',
  '</main>',
  '</article>',
  '</div>',
];

// ---------------------------------------------------------------------------
// 1. cleanHTML
// ---------------------------------------------------------------------------

/**
 * Strip non-essential elements, remove styling/data attributes, and
 * collapse whitespace while preserving the HTML structure.
 */
export function cleanHTML(html: string): string {
  let result = html;

  // --- Remove entire element blocks that add no semantic value ---
  result = result.replace(STYLE_TAG_RE, '');
  result = result.replace(SCRIPT_TAG_RE, '');
  result = result.replace(NOSCRIPT_TAG_RE, '');
  result = result.replace(LINK_STYLESHEET_RE, '');

  // --- Remove HTML comments ---
  result = result.replace(HTML_COMMENT_RE, '');

  // --- Strip unwanted attributes (style, class, data-*) ---
  result = result.replace(STYLE_ATTR_RE, '');
  result = result.replace(CLASS_ATTR_RE, '');
  result = result.replace(DATA_ATTR_RE, '');

  // --- Remove non-kept attributes and truncate long values ---
  result = stripUnknownAttributes(result);

  // --- Collapse runs of whitespace into single spaces ---
  result = result.replace(WHITESPACE_COLLAPSE_RE, ' ');

  return result.trim();
}

/**
 * Walk through every opening tag and remove attributes that aren't in
 * the KEPT_ATTRIBUTES set or that don't start with "aria-". Also
 * truncates attribute values longer than MAX_ATTR_VALUE_LENGTH.
 */
function stripUnknownAttributes(html: string): string {
  // Match opening tags: <tagname ...attributes... > or <tagname ...attributes... />
  return html.replace(
    /<([a-z][\w-]*)(\s[^>]*)?\/?>/gi,
    (_match, tagName, attrsStr) => {
      const selfClose = _match.endsWith('/>') ? '/' : '';

      if (!attrsStr || !attrsStr.trim()) {
        return `<${tagName}${selfClose}>`;
      }

      const keptAttrs: string[] = [];

      // Extract individual attributes from the attribute string
      const attrPattern =
        /\s+([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;

      for (
        let attrMatch = attrPattern.exec(attrsStr);
        attrMatch !== null;
        attrMatch = attrPattern.exec(attrsStr)
      ) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';

        // Keep the attribute if it's in our allow-list or starts with "aria-"
        const isKept =
          KEPT_ATTRIBUTES.has(attrName) || attrName.startsWith('aria-');
        if (!isKept) continue;

        // Truncate long attribute values
        const truncated =
          attrValue.length > MAX_ATTR_VALUE_LENGTH
            ? `${attrValue.slice(0, MAX_ATTR_VALUE_LENGTH)}...`
            : attrValue;

        keptAttrs.push(`${attrName}="${truncated}"`);
      }

      const attrString = keptAttrs.length > 0 ? ` ${keptAttrs.join(' ')}` : '';
      return `<${tagName}${attrString}${selfClose}>`;
    }
  );
}

// ---------------------------------------------------------------------------
// 2. pruneHTML
// ---------------------------------------------------------------------------

/**
 * Simplify deeply nested HTML by replacing content beyond maxDepth with
 * a placeholder, and removing empty non-semantic containers.
 *
 * Uses a simplified regex/character-scanning approach to track nesting
 * depth since no DOM parser is available.
 */
export function pruneHTML(
  html: string,
  maxDepth: number = DEFAULT_MAX_DEPTH
): string {
  let result = removeEmptyContainers(html);
  result = collapseDeepNesting(result, maxDepth);
  // Run empty-container removal again since collapsing may expose new empties
  result = removeEmptyContainers(result);
  return result;
}

/**
 * Remove empty <div> and <span> elements that contain no text or children.
 * Runs iteratively since removing one layer may expose another empty layer.
 */
function removeEmptyContainers(html: string): string {
  // Match <div ...>  </div> or <span ...>  </span> with only whitespace inside
  const emptyContainerRe = /<(div|span)\b[^>]*>\s*<\/\1>/gi;

  let previous = '';
  let current = html;

  // Iterate until no more empty containers are found
  while (current !== previous) {
    previous = current;
    current = current.replace(emptyContainerRe, '');
  }

  return current;
}

/**
 * Scan the HTML character-by-character, tracking tag open/close depth.
 * When depth exceeds maxDepth, collect and count the nested elements,
 * then replace the content with a `[nested: N elements]` placeholder.
 */
function collapseDeepNesting(html: string, maxDepth: number): string {
  const output: string[] = [];
  let depth = 0;
  let i = 0;

  // Void elements that don't have closing tags and don't increase depth
  const voidElements = new Set([
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
  ]);

  while (i < html.length) {
    // --- Check for a tag at current position ---
    if (html[i] === '<') {
      // Find the end of this tag
      const tagEnd = html.indexOf('>', i);
      if (tagEnd === -1) {
        // Malformed HTML — just push the rest
        output.push(html.slice(i));
        break;
      }

      const fullTag = html.slice(i, tagEnd + 1);

      // Determine if it's an opening, closing, or self-closing tag
      const isClosing = fullTag[1] === '/';
      const isSelfClosing = fullTag[fullTag.length - 2] === '/';

      // Extract the tag name
      let tagName = '';
      if (isClosing) {
        const nameMatch = fullTag.match(/^<\/\s*([a-z][\w-]*)/i);
        tagName = nameMatch ? nameMatch[1].toLowerCase() : '';
      } else {
        const nameMatch = fullTag.match(/^<\s*([a-z][\w-]*)/i);
        tagName = nameMatch ? nameMatch[1].toLowerCase() : '';
      }

      const isVoid = voidElements.has(tagName);

      if (isClosing) {
        // Closing tag — decrease depth
        depth = Math.max(0, depth - 1);
        output.push(fullTag);
        i = tagEnd + 1;
      } else if (isSelfClosing || isVoid) {
        // Self-closing or void — no depth change
        if (depth <= maxDepth) {
          output.push(fullTag);
        }
        i = tagEnd + 1;
      } else {
        // Opening tag — check if we're about to exceed maxDepth
        if (depth < maxDepth || isPreservedTag(tagName)) {
          output.push(fullTag);
          depth++;
          i = tagEnd + 1;
        } else {
          // We're at the depth limit for a non-preserved tag.
          // Find the matching closing tag and replace the content.
          const { endIndex, elementCount } = findMatchingClose(
            html,
            i,
            tagName
          );
          output.push(
            `<${tagName}>[nested: ${elementCount} elements]</${tagName}>`
          );
          i = endIndex;
        }
      }
    } else {
      // Regular text character — just pass through
      output.push(html[i]);
      i++;
    }
  }

  return output.join('');
}

/**
 * Check if a tag name is interactive or text-bearing and should always
 * be preserved regardless of nesting depth.
 */
function isPreservedTag(tagName: string): boolean {
  return INTERACTIVE_TAGS.has(tagName) || TEXT_BEARING_TAGS.has(tagName);
}

/**
 * Starting from `startIndex` (pointing at '<' of the opening tag), find
 * the matching closing tag for `tagName`. Returns the index just past
 * the closing tag and a count of child elements found inside.
 */
function findMatchingClose(
  html: string,
  startIndex: number,
  tagName: string
): { endIndex: number; elementCount: number } {
  let depth = 0;
  let elementCount = 0;
  let i = startIndex;

  // Skip past the opening tag we're already at
  const firstClose = html.indexOf('>', i);
  if (firstClose === -1) return { endIndex: html.length, elementCount: 0 };
  i = firstClose + 1;
  depth = 1;

  const closeTag = `</${tagName}>`;

  while (i < html.length && depth > 0) {
    if (html[i] === '<') {
      // Check for closing tag of our target
      if (
        html.slice(i, i + closeTag.length).toLowerCase() ===
        closeTag.toLowerCase()
      ) {
        depth--;
        if (depth === 0) {
          return { endIndex: i + closeTag.length, elementCount };
        }
        i += closeTag.length;
        continue;
      }

      // Check for another opening tag of the same type (nested same-name tags)
      const openMatch = html.slice(i).match(new RegExp(`^<${tagName}\\b`, 'i'));
      if (openMatch) {
        depth++;
      }

      // Count any opening element tag as a child element
      if (html[i + 1] !== '/' && html[i + 1] !== '!') {
        const childTagMatch = html.slice(i).match(/^<([a-z][\w-]*)/i);
        if (childTagMatch) {
          elementCount++;
        }
      }

      // Advance past the tag
      const nextClose = html.indexOf('>', i);
      if (nextClose === -1) break;
      i = nextClose + 1;
    } else {
      i++;
    }
  }

  // If we never found a matching close, consume everything
  return { endIndex: html.length, elementCount };
}

// ---------------------------------------------------------------------------
// 3. chunkHTML
// ---------------------------------------------------------------------------

/**
 * Split large HTML into chunks that fit within maxChars, splitting at
 * semantic tag boundaries when possible.
 */
export function chunkHTML(
  html: string,
  maxChars: number = DEFAULT_MAX_CHARS
): string[] {
  if (html.length <= maxChars) {
    return [html];
  }

  const chunks: string[] = [];
  let remaining = html;

  while (remaining.length > 0) {
    if (remaining.length <= maxChars) {
      chunks.push(remaining);
      break;
    }

    // Search window: look for the best split point in the region up to maxChars
    const window = remaining.slice(0, maxChars);

    // Try each semantic boundary tag, picking the last occurrence before maxChars
    let bestSplit = -1;

    for (const boundary of SEMANTIC_BOUNDARY_TAGS) {
      const idx = window.lastIndexOf(boundary);
      if (idx !== -1) {
        const splitPos = idx + boundary.length;
        if (splitPos > bestSplit) {
          bestSplit = splitPos;
        }
      }
    }

    // Fallback: split at the nearest '>' before maxChars
    if (bestSplit === -1) {
      const lastAngle = window.lastIndexOf('>');
      if (lastAngle !== -1) {
        bestSplit = lastAngle + 1;
      }
    }

    // Final fallback: hard split at maxChars
    if (bestSplit === -1 || bestSplit === 0) {
      bestSplit = maxChars;
    }

    chunks.push(remaining.slice(0, bestSplit));
    remaining = remaining.slice(bestSplit);
  }

  return chunks;
}

// ---------------------------------------------------------------------------
// 4. processDOM
// ---------------------------------------------------------------------------

/**
 * End-to-end pipeline: clean -> prune -> chunk.
 * Returns the first chunk (primary use case for AI analysis).
 *
 * If the result is still too large after the initial prune, applies
 * progressively more aggressive pruning (maxDepth 5, then 3), and
 * ultimately truncates if nothing else fits.
 */
export function processDOM(html: string): string {
  // Step 1: Clean the HTML (strip scripts, styles, unwanted attributes)
  let result = cleanHTML(html);

  // Step 2: Prune with default depth
  result = pruneHTML(result);

  // Step 3: If still too large, re-prune more aggressively
  if (result.length > DEFAULT_MAX_CHARS) {
    result = pruneHTML(result, 5);
  }

  if (result.length > DEFAULT_MAX_CHARS) {
    result = pruneHTML(result, 3);
  }

  // Step 4: If still too large, truncate to the limit
  if (result.length > DEFAULT_MAX_CHARS) {
    result = result.slice(0, DEFAULT_MAX_CHARS);
  }

  // Step 5: Return first chunk (in case chunking is needed at exact boundary)
  const chunks = chunkHTML(result);
  return chunks[0];
}
