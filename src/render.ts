import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import os from "node:os";

export type OutputFormat = "html" | "svg" | "png" | "mermaid";

export interface RenderOptions {
  format: OutputFormat;
  outputPath?: string;
  title?: string;
  /** Map of Mermaid node ID → URL for clickable drill-down nodes. */
  links?: Record<string, string>;
}

export interface RenderResult {
  outputPath: string;
  format: OutputFormat;
}

const HTML_TEMPLATE = (title: string, mermaid: string, links: Record<string, string> = {}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid #1e2433;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #161b27;
    }
    header h1 {
      font-size: 1rem;
      font-weight: 600;
      color: #94a3b8;
    }
    header .badge {
      font-size: 0.7rem;
      background: #1e3a5f;
      color: #60a5fa;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      font-weight: 500;
    }
    .toolbar {
      padding: 0.5rem 1.5rem;
      background: #161b27;
      border-bottom: 1px solid #1e2433;
      display: flex;
      gap: 0.5rem;
    }
    .toolbar button {
      font-size: 0.75rem;
      background: #1e2433;
      color: #94a3b8;
      border: 1px solid #2d3748;
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      cursor: pointer;
    }
    .toolbar button:hover { background: #2d3748; color: #e2e8f0; }
    main {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
      overflow: auto;
    }
    #diagram {
      background: #161b27;
      border: 1px solid #1e2433;
      border-radius: 8px;
      padding: 2rem;
      max-width: 100%;
      overflow: auto;
    }
    #diagram svg { max-width: 100%; height: auto; }
    pre#mermaid-source {
      display: none;
      background: #1a2035;
      padding: 1.5rem;
      border-radius: 8px;
      font-size: 0.8rem;
      color: #94a3b8;
      overflow: auto;
      white-space: pre;
      max-width: 900px;
    }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(title)}</h1>
    <span class="badge">llm-flow</span>
  </header>
  <div class="toolbar">
    <button onclick="toggleSource()">Toggle Mermaid Source</button>
    <button onclick="window.print()">Print / Export PDF</button>
    <button onclick="copySource()">Copy Source</button>
  </div>
  <main>
    <div id="diagram">
      <pre class="mermaid">
${escapeMermaid(mermaid)}
      </pre>
    </div>
    <pre id="mermaid-source">${escapeHtml(mermaid)}</pre>
  </main>
  <script>
    mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'loose', flowchart: { curve: 'basis' } });

    const __drilldown = ${JSON.stringify(links)};

    function findNodeEl(svg, nodeId) {
      let el = svg.querySelector('g[data-id="' + nodeId + '"]');
      if (el) return el;
      el = svg.querySelector('[id^="flowchart-' + nodeId + '-"]');
      if (el) return el;
      el = svg.querySelector('[id*="-' + nodeId + '"]');
      if (el) return el;
      const gEls = Array.from(svg.querySelectorAll('g'));
      return gEls.find(g => {
        if (!g.classList.contains('node')) return false;
        const label = g.querySelector('.label');
        return label && label.textContent.trim().includes(nodeId);
      }) || null;
    }

    function makeNodeClickable(el, url) {
      el.style.cursor = 'pointer';
      el.style.pointerEvents = 'all';
      el.querySelectorAll('rect, polygon, circle, ellipse, path').forEach(s => {
        s.style.stroke = '#60a5fa';
        s.style.strokeWidth = '2.5px';
        s.style.filter = 'drop-shadow(0 0 6px rgba(96,165,250,0.4))';
        s.style.pointerEvents = 'all';
        s.style.cursor = 'pointer';
      });
      const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
      t.textContent = '\uD83D\uDD17 Click to drill down';
      el.prepend(t);
      el.addEventListener('click', (e) => { e.stopPropagation(); window.open(url, '_blank'); });
    }

    mermaid.run().then(() => {
      setTimeout(() => {
        const svg = document.querySelector('#diagram svg');
        if (!svg) return;
        for (const [nodeId, url] of Object.entries(__drilldown)) {
          const el = findNodeEl(svg, nodeId);
          if (el) makeNodeClickable(el, url);
        }
      }, 100);
    });

    function toggleSource() {
      const src = document.getElementById('mermaid-source');
      src.style.display = src.style.display === 'none' ? 'block' : 'none';
    }

    function copySource() {
      navigator.clipboard.writeText(${JSON.stringify(mermaid)}).then(() => {
        alert('Mermaid source copied to clipboard');
      });
    }
  </script>
</body>
</html>`;

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeMermaid(str: string): string {
  return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function resolveOutputPath(
  format: OutputFormat,
  outputPath?: string,
  title?: string
): string {
  if (outputPath) return path.resolve(outputPath);
  const base = (title ?? "flowchart")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = format === "mermaid" ? "mmd" : format;
  return path.join(os.tmpdir(), `${base}-${Date.now()}.${ext}`);
}

export async function renderFlowchart(
  mermaid: string,
  options: RenderOptions
): Promise<RenderResult> {
  const { format, title = "Flowchart", links = {} } = options;
  const outputPath = resolveOutputPath(format, options.outputPath, title);

  if (format === "mermaid") {
    fs.writeFileSync(outputPath, mermaid, "utf8");
    return { outputPath, format };
  }

  if (format === "html") {
    const html = HTML_TEMPLATE(title, mermaid, links);
    fs.writeFileSync(outputPath, html, "utf8");
    return { outputPath, format };
  }

  // PNG or SVG — use mermaid-cli (mmdc) if available, otherwise fall back to HTML
  const mmdPath = path.join(os.tmpdir(), `llm-flow-${Date.now()}.mmd`);
  fs.writeFileSync(mmdPath, mermaid, "utf8");

  try {
    // Try npx mmdc
    execSync(
      `npx --yes @mermaid-js/mermaid-cli mmdc -i "${mmdPath}" -o "${outputPath}" --theme dark`,
      { stdio: "pipe", timeout: 60000 }
    );
    return { outputPath, format };
  } catch {
    // Fall back to HTML if mmdc fails (headless chrome not available)
    const htmlPath = outputPath.replace(/\.(png|svg)$/, ".html");
    const html = HTML_TEMPLATE(title, mermaid, links);
    fs.writeFileSync(htmlPath, html, "utf8");
    return { outputPath: htmlPath, format: "html" };
  } finally {
    try { fs.unlinkSync(mmdPath); } catch { /* ignore */ }
  }
}

export function openFile(filePath: string): void {
  const platform = os.platform();
  try {
    if (platform === "darwin") {
      execSync(`open "${filePath}"`, { stdio: "ignore" });
    } else if (platform === "win32") {
      execSync(`start "" "${filePath}"`, { stdio: "ignore", shell: "cmd.exe" });
    } else {
      execSync(`xdg-open "${filePath}"`, { stdio: "ignore" });
    }
  } catch {
    // Silently ignore if no viewer available
  }
}
