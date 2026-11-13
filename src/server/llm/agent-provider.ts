import { GenerationContext, LLMResponse } from './provider-interface.js';

export class AgentBridgeService {
  private isRunning = false;

  async runAgentJob(
    shotDir: string,
    context: GenerationContext,
    onLog?: (line: string) => void
  ): Promise<LLMResponse> {
    throw new Error('Antigravity Agent bridge is not implemented yet (scheduled for Phase 3). Please select Gemini or Claude in the top bar.');
  }

  cancelJob() {
    this.isRunning = false;
  }
}

export const agentBridgeService = new AgentBridgeService();
