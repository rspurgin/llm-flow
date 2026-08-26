#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { renderFlowchart, openFile, type OutputFormat } from "./render.js";
import { extractSymbol, traceRailsRoute, readFile } from "./extract.js";

const server = new McpServer({
  name: "llm-flow",
  version: "0.1.0",
});

// Tool: render_flowchart
server.tool(
  "render_flowchart",
  "Render a Mermaid flowchart to HTML, SVG, PNG, or .mmd file. " +
    "Use this after generating business-language Mermaid syntax from code analysis. " +
    "Returns the output file path.",
  {
    mermaid: z
      .string()
      .describe("Valid Mermaid flowchart syntax (flowchart TD ...)"),
    format: z
      .enum(["html", "svg", "png", "mermaid"])
      .default("html")
      .describe("Output format. 'html' is recommended — self-contained, opens in any browser."),
    title: z
      .string()
      .optional()
      .describe("Title for the diagram (used in HTML header and filename)"),
    output_path: z
      .string()
      .optional()
      .describe("Absolute path for the output file. If omitted, saves to system temp directory."),
    open: z
      .boolean()
      .default(false)
      .describe("Open the rendered file in the system default viewer after saving"),
  },
  async ({ mermaid, format, title, output_path, open }) => {
    const result = await renderFlowchart(mermaid, {
      format: format as OutputFormat,
      title,
      outputPath: output_path,
    });

    if (open) openFile(result.outputPath);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: true,
            outputPath: result.outputPath,
            format: result.format,
            message:
              result.format !== format
                ? `Note: Requested ${format} but fell back to ${result.format} (headless Chrome not available for PNG/SVG rendering).`
                : undefined,
          }),
        },
      ],
    };
  }
);

// Tool: read_file
server.tool(
  "read_file",
  "Read a source code file and return its contents along with detected language and line count. " +
    "Use this to load code before analyzing it and generating a flowchart.",
  {
    file_path: z
      .string()
      .describe("Absolute or relative path to the source code file"),
  },
  async ({ file_path }) => {
    const result = readFile(file_path);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            content: result.content,
            language: result.language,
            lines: result.lines,
            filePath: file_path,
          }),
        },
      ],
    };
  }
);

// Tool: extract_symbol
server.tool(
  "extract_symbol",
  "Extract a specific method, function, or action from a source file by name. " +
    "Returns just that block of code with a few lines of surrounding context. " +
    "Use this to focus on one method before generating its flowchart, especially in large files.",
  {
    file_path: z
      .string()
      .describe("Absolute or relative path to the source code file"),
    symbol_name: z
      .string()
      .describe(
        "Name of the method, function, or action to extract " +
          "(e.g. 'checkout', 'ProcessPayment', 'handle_request')"
      ),
    context_lines: z
      .number()
      .int()
      .min(0)
      .max(20)
      .default(3)
      .describe("Number of surrounding context lines to include before and after the symbol"),
  },
  async ({ file_path, symbol_name, context_lines }) => {
    const result = extractSymbol(file_path, symbol_name, context_lines);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            code: result.code,
            filePath: result.filePath,
            symbolName: result.symbolName,
            startLine: result.startLine,
            endLine: result.endLine,
            language: result.language,
          }),
        },
      ],
    };
  }
);

// Tool: trace_rails_route
server.tool(
  "trace_rails_route",
  "Trace a Rails route (e.g. 'POST /checkout') through routes.rb to its controller action, " +
    "then extract that action's code. Use this to flowchart a specific HTTP endpoint in a Rails app.",
  {
    project_root: z
      .string()
      .describe("Absolute path to the Rails project root (the directory containing config/routes.rb)"),
    route: z
      .string()
      .describe("HTTP route to trace, e.g. 'POST /checkout' or 'GET /users/:id'"),
  },
  async ({ project_root, route }) => {
    const result = traceRailsRoute(project_root, route);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            controllerFile: result.controllerFile,
            actionName: result.actionName,
            code: result.code,
            startLine: result.startLine,
            endLine: result.endLine,
          }),
        },
      ],
    };
  }
);

// Tool: open_diagram
server.tool(
  "open_diagram",
  "Open a previously rendered diagram file in the system default viewer (browser for HTML, image viewer for PNG/SVG).",
  {
    file_path: z.string().describe("Absolute path to the diagram file to open"),
  },
  async ({ file_path }) => {
    openFile(file_path);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ success: true, opened: file_path }),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("llm-flow MCP server running on stdio\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${err}\n`);
  process.exit(1);
});
