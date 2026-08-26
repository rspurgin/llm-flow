#!/usr/bin/env node
import { Command } from "commander";
import path from "node:path";
import fs from "node:fs";
import { generateFlowchart, type LLMProvider } from "./llm.js";
import { renderFlowchart, openFile, type OutputFormat } from "./render.js";
import { extractSymbol, traceRailsRoute, readFile } from "./extract.js";

const program = new Command();

program
  .name("llm-flow")
  .description(
    "Generate business-language flowcharts from code using LLMs.\n\n" +
      "Requires ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable."
  )
  .version("0.1.0");

// ─── analyze command ─────────────────────────────────────────────────────────

program
  .command("analyze <file>")
  .description("Analyze a source file (or specific method/endpoint) and generate a flowchart")
  .option("-m, --method <name>", "Extract and flowchart a specific method or function by name")
  .option(
    "-e, --endpoint <route>",
    'Trace a Rails route and flowchart its action (e.g. "POST /checkout")'
  )
  .option(
    "-r, --rails-root <path>",
    "Rails project root for route tracing (defaults to CWD)"
  )
  .option(
    "-f, --format <format>",
    "Output format: html, svg, png, or mermaid (default: html)",
    "html"
  )
  .option("-o, --output <path>", "Output file path (default: temp directory)")
  .option("--open", "Open the rendered diagram automatically", false)
  .option(
    "-p, --provider <provider>",
    "LLM provider: anthropic, openai, or auto (default: auto)",
    "auto"
  )
  .option("-c, --context <text>", "Extra context to give the LLM about this code")
  .action(async (file: string, opts) => {
    const filePath = path.resolve(file);

    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    let code: string;
    let symbolName: string | undefined;
    let language: string;
    let extractedFilePath = filePath;

    try {
      if (opts.endpoint) {
        // Rails route tracing
        const railsRoot = path.resolve(opts.railsRoot ?? process.cwd());
        console.error(`Tracing route "${opts.endpoint}" in ${railsRoot}...`);
        const traced = traceRailsRoute(railsRoot, opts.endpoint);
        code = traced.code;
        symbolName = traced.actionName;
        language = "ruby";
        extractedFilePath = traced.controllerFile;
        console.error(`Found action "${traced.actionName}" in ${traced.controllerFile}`);
        console.error(`Lines ${traced.startLine}–${traced.endLine}`);
      } else if (opts.method) {
        // Specific method extraction
        console.error(`Extracting method "${opts.method}" from ${filePath}...`);
        const extracted = extractSymbol(filePath, opts.method);
        code = extracted.code;
        symbolName = extracted.symbolName;
        language = extracted.language;
        console.error(
          `Extracted ${extracted.language} method (lines ${extracted.startLine}–${extracted.endLine})`
        );
      } else {
        // Whole file
        const result = readFile(filePath);
        code = result.content;
        language = result.language;
        console.error(
          `Loaded ${filePath} (${result.lines} lines, language: ${result.language})`
        );
      }
    } catch (err) {
      console.error(`Extraction error: ${(err as Error).message}`);
      process.exit(1);
    }

    console.error(`Generating flowchart via ${opts.provider} LLM...`);

    let flowchart;
    try {
      flowchart = await generateFlowchart(
        {
          code,
          language,
          symbolName,
          filePath: extractedFilePath,
          extraContext: opts.context,
        },
        opts.provider as LLMProvider
      );
    } catch (err) {
      console.error(`LLM error: ${(err as Error).message}`);
      process.exit(1);
    }

    console.error(`Generated flowchart: "${flowchart.title}" (via ${flowchart.provider})`);

    let result;
    try {
      result = await renderFlowchart(flowchart.mermaid, {
        format: opts.format as OutputFormat,
        title: flowchart.title,
        outputPath: opts.output,
      });
    } catch (err) {
      console.error(`Render error: ${(err as Error).message}`);
      process.exit(1);
    }

    if (opts.open) {
      openFile(result.outputPath);
      console.error(`Opened: ${result.outputPath}`);
    }

    // Print output path to stdout so it can be piped/used by other tools
    console.log(result.outputPath);
    console.error(`Done. Output: ${result.outputPath}`);
  });

// ─── render command (rendering-only, no LLM) ─────────────────────────────────

program
  .command("render <mermaid-file>")
  .description(
    "Render an existing .mmd Mermaid file to HTML/SVG/PNG (no LLM required)"
  )
  .option("-f, --format <format>", "Output format: html, svg, png (default: html)", "html")
  .option("-o, --output <path>", "Output file path")
  .option("-t, --title <title>", "Diagram title", "Flowchart")
  .option("--open", "Open the rendered diagram automatically", false)
  .action(async (mermaidFile: string, opts) => {
    const filePath = path.resolve(mermaidFile);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${filePath}`);
      process.exit(1);
    }

    const mermaid = fs.readFileSync(filePath, "utf8");
    const result = await renderFlowchart(mermaid, {
      format: opts.format as OutputFormat,
      title: opts.title,
      outputPath: opts.output,
    });

    if (opts.open) openFile(result.outputPath);

    console.log(result.outputPath);
    console.error(`Done. Output: ${result.outputPath}`);
  });

// ─── extract command (no LLM, just prints code) ──────────────────────────────

program
  .command("extract <file>")
  .description("Extract a specific method or function from a file and print it (no LLM)")
  .option("-m, --method <name>", "Method/function name to extract (required)")
  .option(
    "-e, --endpoint <route>",
    'Rails route to trace (e.g. "POST /checkout")'
  )
  .option("-r, --rails-root <path>", "Rails project root (defaults to CWD)")
  .action(async (file: string, opts) => {
    if (!opts.method && !opts.endpoint) {
      console.error("Error: Provide --method <name> or --endpoint <route>");
      process.exit(1);
    }

    try {
      if (opts.endpoint) {
        const railsRoot = path.resolve(opts.railsRoot ?? process.cwd());
        const traced = traceRailsRoute(railsRoot, opts.endpoint);
        console.log(traced.code);
      } else {
        const extracted = extractSymbol(path.resolve(file), opts.method);
        console.log(extracted.code);
      }
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  });

program.parse();
