import Anthropic from '@anthropic-ai/sdk';
import crypto from 'crypto';
import { ILLMProvider, GenerationContext, LLMResponse } from './provider-interface.js';
import { LLMGenerationOutputSchema, LLMGenerationOutput } from '../../common/types.js';
import { buildSystemPrompt, buildUserPrompt } from './prompt-builder.js';
import { globalRateLimiter } from './rate-limiter.js';

export class ClaudeProvider implements ILLMProvider {
  name = 'anthropic';
  private client: Anthropic | null = null;
  private modelName: string;

  constructor() {
    const key = process.env.ANTHROPIC_API_KEY?.trim();
    if (key) {
      this.client = new Anthropic({ apiKey: key });
    }
    this.modelName = process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';
  }

  async generate(context: GenerationContext): Promise<LLMResponse> {
    const startTime = Date.now();
    const systemPrompt = buildSystemPrompt(context.brandKit);
    const userPrompt = buildUserPrompt(context);

    if (!this.client || !process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not configured in .env');
    }

    return globalRateLimiter.execute(async () => {
      // Use Anthropic Prompt Caching on the large static system prompt
      const response = await this.client!.messages.create({
        model: this.modelName,
        max_tokens: 4096,
        system: [
          {
            type: 'text',
            text: systemPrompt,
            cache_control: { type: 'ephemeral' }
          }
        ],
        messages: [
          {
            role: 'user',
            content: `${userPrompt}\n\nIMPORTANT: Respond with pure, unadorned JSON adhering to the required output schema.`
          }
        ]
      });

      const latency = Date.now() - startTime;
      let rawText = '';
      for (const block of response.content) {
        if (block.type === 'text') {
          rawText += block.text;
        }
      }

      // Parse JSON
      let parsedJson: any;
      try {
        parsedJson = JSON.parse(rawText);
      } catch (e) {
        const cleaned = rawText.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        parsedJson = JSON.parse(cleaned);
      }

      const validated: LLMGenerationOutput = LLMGenerationOutputSchema.parse(parsedJson);

      const promptTokens = response.usage.input_tokens;
      const completionTokens = response.usage.output_tokens;
      const totalTokens = promptTokens + completionTokens;

      // Claude 3.7 Sonnet estimate ($3 / 1M input, $15 / 1M output)
      const cost = (promptTokens * 0.000003) + (completionTokens * 0.000015);

      return {
        output: validated,
        provider: 'anthropic',
        model: this.modelName,
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCostUsd: Number(cost.toFixed(6)),
        latencyMs: latency
      };
    });
  }

  async edit(context: GenerationContext): Promise<LLMResponse> {
    return this.generate(context);
  }
}

