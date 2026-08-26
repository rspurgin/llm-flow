# llm-flow

Generate business-language flowcharts from code using LLMs. Point it at a file, method, or HTTP endpoint and get a clear visual diagram — in plain English, not code syntax.

Works as an **MCP server** (for Claude CLI, Codex CLI, and Cursor) and as a **standalone CLI** (with your own Anthropic or OpenAI API key).

---

## How it works

1. You (or an LLM agent) point the tool at a file, method, or endpoint
2. The code is extracted and sent to an LLM with a prompt that says: *explain this as a business-language flowchart*
3. The LLM generates [Mermaid](https://mermaid.js.org/) syntax using plain English node labels
4. The tool renders it to HTML (or SVG/PNG) and optionally opens it in your browser

**Example output** for a Rails checkout action:

```
flowchart TD
    start([Customer submits checkout]) --> checkCart{"Is cart empty?"}
    checkCart -->|Yes| emptyCart["Show empty cart error"]
    checkCart -->|No| checkStock{"All items in stock?"}
    checkStock -->|No| outOfStock["Notify customer, suggest alternatives"]
    checkStock -->|Yes| chargeCard["Charge payment method"]
    chargeCard --> payResult{"Payment successful?"}
    payResult -->|No| payFail["Show payment error, keep cart"]
    payResult -->|Yes| createOrder["Create order record"]
    createOrder --> sendEmail["Send confirmation email"]
    sendEmail --> done([Redirect to order confirmation page])
```

---

## Installation

```bash
# Clone and build
git clone https://github.com/flatpickman/llm-flow
cd llm-flow
npm install
npm run build

# Or install globally once published to npm
npm install -g llm-flow
```

---

## Standalone CLI

Requires `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` set in your environment.

### Flowchart a whole file

```bash
llm-flow analyze src/payment_service.rb
```

### Flowchart a specific method

```bash
llm-flow analyze app/controllers/orders_controller.rb --method checkout
llm-flow analyze PaymentService.cs --method ProcessPayment
llm-flow analyze src/auth/handler.py --method login
```

### Flowchart a Rails endpoint

```bash
llm-flow analyze . --endpoint "POST /checkout" --rails-root /path/to/myapp
```

### Options

```
llm-flow analyze <file> [options]

  -m, --method <name>       Extract and flowchart a specific method by name
  -e, --endpoint <route>    Trace a Rails route (e.g. "POST /checkout")
  -r, --rails-root <path>   Rails project root for route tracing (default: CWD)
  -f, --format <format>     Output format: html, svg, png, or mermaid (default: html)
  -o, --output <path>       Output file path (default: system temp dir)
      --open                Open the diagram in your browser/viewer after rendering
  -p, --provider <name>     LLM provider: anthropic, openai, or auto (default: auto)
  -c, --context <text>      Extra context to give the LLM about this code
```

### Render an existing .mmd file (no LLM)

```bash
llm-flow render my-diagram.mmd --format html --open
```

### Extract code without generating a flowchart

```bash
llm-flow extract src/orders_controller.rb --method checkout
llm-flow extract . --endpoint "POST /checkout" --rails-root /path/to/myapp
```

---

## MCP Server

The MCP server lets LLM agents (Claude, Codex, Cursor) call the tools directly. The LLM does the code analysis; the server handles extraction and rendering.

### Configure in Claude CLI (`~/.claude.json` or `claude mcp add`)

```json
{
  "mcpServers": {
    "llm-flow": {
      "command": "node",
      "args": ["/absolute/path/to/llm-flow/dist/server.js"]
    }
  }
}
```

Or with npx (once published to npm):

```json
{
  "mcpServers": {
    "llm-flow": {
      "command": "npx",
      "args": ["-y", "llm-flow", "--mcp"]
    }
  }
}
```

### Configure in OpenAI Codex CLI

```json
{
  "mcpServers": {
    "llm-flow": {
      "command": "node",
      "args": ["/absolute/path/to/llm-flow/dist/server.js"]
    }
  }
}
```

### Configure in Cursor

In Cursor Settings → MCP → Add Server:

```json
{
  "llm-flow": {
    "command": "node",
    "args": ["/absolute/path/to/llm-flow/dist/server.js"]
  }
}
```

### MCP tools available to the agent

| Tool | Description |
|---|---|
| `render_flowchart` | Render Mermaid syntax to HTML / SVG / PNG |
| `read_file` | Read a source file and return its contents |
| `extract_symbol` | Extract a specific method or function from a file |
| `trace_rails_route` | Trace a Rails route to its controller action |
| `open_diagram` | Open a rendered diagram file in the system viewer |

### Example agent workflow (what Claude/Codex does automatically)

```
User: "Flowchart the checkout action in my Rails app"

Agent:
  1. trace_rails_route("POST /checkout") → gets controller code
  2. Reads code, generates business-language Mermaid
  3. render_flowchart(mermaid, format="html", open=true) → opens browser
```

---

## Output formats

| Format | Use case |
|---|---|
| `html` | Self-contained page, dark mode, toggle source, open in any browser |
| `svg` | Vector image, embed in docs or Confluence |
| `png` | Raster image (requires headless Chrome via `npx mmdc`) |
| `mermaid` | Raw `.mmd` text — paste into GitHub, GitLab, Notion, or Obsidian |

PNG and SVG rendering requires headless Chrome. If unavailable, the tool automatically falls back to HTML and prints a note.

---

## Supported languages for method extraction

C#, Ruby, Python, TypeScript, JavaScript, Java, Kotlin, Go, PHP, Rust, Swift, Dart, C/C++, and more. Rails route tracing works with standard `config/routes.rb` conventions.

---

## Environment variables

| Variable | Required for |
|---|---|
| `ANTHROPIC_API_KEY` | Standalone CLI with Anthropic/Claude |
| `OPENAI_API_KEY` | Standalone CLI with OpenAI/GPT-4o |

The MCP server does **not** need API keys — the LLM agent calling it provides its own reasoning.

---

## License

MIT
