import fs from "node:fs";
import path from "node:path";
// Detect language from file extension
function detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        ".rb": "ruby",
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".js": "javascript",
        ".jsx": "javascript",
        ".cs": "csharp",
        ".java": "java",
        ".go": "go",
        ".php": "php",
        ".rs": "rust",
        ".kt": "kotlin",
        ".swift": "swift",
        ".cpp": "cpp",
        ".c": "c",
        ".h": "c",
    };
    return map[ext] ?? "unknown";
}
// Build patterns for finding method/function start lines per language
function getMethodPatterns(language, symbolName) {
    const esc = symbolName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    switch (language) {
        case "ruby":
            return [
                new RegExp(`^\\s*def\\s+${esc}\\b`),
                new RegExp(`^\\s*def\\s+self\\.${esc}\\b`),
            ];
        case "python":
            return [
                new RegExp(`^\\s*def\\s+${esc}\\s*\\(`),
                new RegExp(`^\\s*async\\s+def\\s+${esc}\\s*\\(`),
            ];
        case "typescript":
        case "javascript":
            return [
                new RegExp(`^\\s*(async\\s+)?${esc}\\s*\\(`),
                new RegExp(`^\\s*(public|private|protected|static|async|\\s)*\\s*${esc}\\s*\\(`),
                new RegExp(`^\\s*(const|let|var)\\s+${esc}\\s*=\\s*(async\\s+)?\\(`),
                new RegExp(`^\\s*function\\s+${esc}\\s*\\(`),
            ];
        case "csharp":
            return [
                new RegExp(`^\\s*(public|private|protected|internal|static|async|override|virtual|abstract|\\s)*\\s+\\w[\\w<>\\[\\]]*\\s+${esc}\\s*\\(`),
            ];
        case "java":
        case "kotlin":
            return [
                new RegExp(`^\\s*(public|private|protected|static|final|override|suspend|\\s)*\\s+\\w+\\s+${esc}\\s*\\(`),
                new RegExp(`^\\s*fun\\s+${esc}\\s*\\(`),
            ];
        case "go":
            return [
                new RegExp(`^func\\s+(\\(\\w+\\s+\\*?\\w+\\)\\s+)?${esc}\\s*\\(`),
            ];
        case "php":
            return [
                new RegExp(`^\\s*(public|private|protected|static|\\s)*\\s*function\\s+${esc}\\s*\\(`),
            ];
        case "rust":
            return [
                new RegExp(`^\\s*(pub(\\(\\w+\\))?\\s+)?(async\\s+)?fn\\s+${esc}\\s*[(<]`),
            ];
        default:
            return [
                new RegExp(`\\b${esc}\\s*[({]`),
                new RegExp(`def\\s+${esc}`),
                new RegExp(`function\\s+${esc}`),
            ];
    }
}
// Find where a method body ends given the start line index
function findMethodEnd(lines, startIdx, language) {
    // Ruby / Python use indentation-based endings (end keyword or dedent)
    if (language === "ruby") {
        let depth = 0;
        for (let i = startIdx; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (/^(def|do|if|unless|while|until|for|begin|case|module|class)\b/.test(trimmed)) {
                depth++;
            }
            if (/^end\b/.test(trimmed)) {
                depth--;
                if (depth <= 0)
                    return i;
            }
        }
        return lines.length - 1;
    }
    if (language === "python") {
        const startIndent = lines[startIdx].match(/^(\s*)/)?.[1]?.length ?? 0;
        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];
            if (line.trim() === "")
                continue;
            const indent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
            if (indent <= startIndent && line.trim() !== "")
                return i - 1;
        }
        return lines.length - 1;
    }
    // Brace-counted languages
    let braceDepth = 0;
    let started = false;
    for (let i = startIdx; i < lines.length; i++) {
        const line = lines[i];
        for (const ch of line) {
            if (ch === "{") {
                braceDepth++;
                started = true;
            }
            if (ch === "}") {
                braceDepth--;
                if (started && braceDepth <= 0)
                    return i;
            }
        }
    }
    return lines.length - 1;
}
export function extractSymbol(filePath, symbolName, contextLines = 3) {
    const absPath = path.resolve(filePath);
    const content = fs.readFileSync(absPath, "utf8");
    const lines = content.split("\n");
    const language = detectLanguage(absPath);
    const patterns = getMethodPatterns(language, symbolName);
    let foundIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (patterns.some((p) => p.test(lines[i]))) {
            foundIdx = i;
            break;
        }
    }
    if (foundIdx === -1) {
        throw new Error(`Symbol "${symbolName}" not found in ${filePath}. ` +
            `Searched ${lines.length} lines with ${patterns.length} pattern(s).`);
    }
    const endIdx = findMethodEnd(lines, foundIdx, language);
    const ctxStart = Math.max(0, foundIdx - contextLines);
    const ctxEnd = Math.min(lines.length - 1, endIdx + contextLines);
    return {
        code: lines.slice(ctxStart, ctxEnd + 1).join("\n"),
        filePath: absPath,
        symbolName,
        startLine: ctxStart + 1,
        endLine: ctxEnd + 1,
        language,
    };
}
// Trace a Rails route (e.g. "POST /checkout") to its controller action
export function traceRailsRoute(projectRoot, route) {
    const [verb, urlPath] = route.trim().split(/\s+/);
    if (!verb || !urlPath) {
        throw new Error(`Invalid route format. Use "VERB /path" e.g. "POST /checkout"`);
    }
    const routesPath = path.join(projectRoot, "config", "routes.rb");
    if (!fs.existsSync(routesPath)) {
        throw new Error(`Rails routes file not found at ${routesPath}`);
    }
    const routesContent = fs.readFileSync(routesPath, "utf8");
    const routeLines = routesContent.split("\n");
    // Match patterns like:
    //   post '/checkout', to: 'orders#checkout'
    //   resources :orders do ... end  (conventional REST)
    //   get 'checkout', to: 'orders#index'
    const verbLower = verb.toLowerCase();
    const pathSegments = urlPath.replace(/^\//, "").split("/");
    let controllerName = "";
    let actionName = "";
    for (const line of routeLines) {
        const trimmed = line.trim();
        // Explicit route with `to:` option
        const explicit = trimmed.match(new RegExp(`${verbLower}\\s+['"]([^'"]+)['"],\\s*to:\\s*['"]([\\w]+)#([\\w]+)['"]`, "i"));
        if (explicit) {
            const routeUrl = explicit[1].replace(/^\//, "");
            const urlWithoutLeading = urlPath.replace(/^\//, "");
            if (routeUrl === urlWithoutLeading ||
                routeUrl === pathSegments[pathSegments.length - 1]) {
                controllerName = explicit[2];
                actionName = explicit[3];
                break;
            }
        }
        // resources :name (conventional REST mapping)
        const resources = trimmed.match(/resources?\s+:(\w+)/);
        if (resources) {
            const resource = resources[1];
            const singular = resource.replace(/s$/, "");
            if (pathSegments[0] === resource ||
                pathSegments[0] === singular) {
                const restMap = {
                    "GET /": "index",
                    "GET /new": "new",
                    "POST /": "create",
                    "GET /:id": "show",
                    "GET /:id/edit": "edit",
                    "PATCH /:id": "update",
                    "PUT /:id": "update",
                    "DELETE /:id": "destroy",
                };
                const key = `${verb.toUpperCase()} /${pathSegments.slice(1).join("/")}`;
                const mapped = restMap[key] ?? restMap[`${verb.toUpperCase()} /`];
                if (mapped) {
                    controllerName = resource;
                    actionName = mapped;
                    break;
                }
            }
        }
    }
    if (!controllerName || !actionName) {
        throw new Error(`Could not trace route "${route}" in ${routesPath}. ` +
            `Try specifying the controller file and action directly with --file and --method.`);
    }
    // Find the controller file
    const controllerFile = findRailsController(projectRoot, controllerName);
    const result = extractSymbol(controllerFile, actionName);
    return {
        controllerFile,
        actionName,
        code: result.code,
        startLine: result.startLine,
        endLine: result.endLine,
    };
}
function findRailsController(projectRoot, name) {
    const candidates = [
        path.join(projectRoot, "app", "controllers", `${name}_controller.rb`),
        path.join(projectRoot, "app", "controllers", `${name}s_controller.rb`),
        path.join(projectRoot, "app", "controllers", `${name}.rb`),
    ];
    for (const c of candidates) {
        if (fs.existsSync(c))
            return c;
    }
    throw new Error(`Controller file for "${name}" not found. Tried:\n` +
        candidates.map((c) => `  ${c}`).join("\n"));
}
export function readFile(filePath) {
    const absPath = path.resolve(filePath);
    const content = fs.readFileSync(absPath, "utf8");
    return {
        content,
        language: detectLanguage(absPath),
        lines: content.split("\n").length,
    };
}
//# sourceMappingURL=extract.js.map