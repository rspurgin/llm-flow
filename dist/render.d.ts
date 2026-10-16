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
export declare function renderFlowchart(mermaid: string, options: RenderOptions): Promise<RenderResult>;
export declare function openFile(filePath: string): void;
//# sourceMappingURL=render.d.ts.map