export interface ExtractResult {
    code: string;
    filePath: string;
    symbolName: string;
    startLine: number;
    endLine: number;
    language: string;
}
export interface RouteTraceResult {
    controllerFile: string;
    actionName: string;
    code: string;
    startLine: number;
    endLine: number;
}
export declare function extractSymbol(filePath: string, symbolName: string, contextLines?: number): ExtractResult;
export declare function traceRailsRoute(projectRoot: string, route: string): RouteTraceResult;
export declare function readFile(filePath: string): {
    content: string;
    language: string;
    lines: number;
};
//# sourceMappingURL=extract.d.ts.map