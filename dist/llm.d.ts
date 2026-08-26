export type LLMProvider = "anthropic" | "openai" | "auto";
export interface FlowchartRequest {
    code: string;
    language?: string;
    symbolName?: string;
    filePath?: string;
    extraContext?: string;
}
export interface FlowchartResponse {
    mermaid: string;
    title: string;
    provider: LLMProvider;
}
export declare function generateFlowchart(req: FlowchartRequest, provider?: LLMProvider): Promise<FlowchartResponse>;
//# sourceMappingURL=llm.d.ts.map