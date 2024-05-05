import OpenAI from "openai";
import { Model } from "./models/openai";
import { getContext } from "./utils";
type AgentProps = {
  role: string;
  goal: string;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  model?: {
    call: (
      systemPrompt: string,
      prompt: string,
      tools: any,
      context?: string
    ) => Promise<string>;
  };
};
const Agent = function ({ role, goal, tools, model }: AgentProps) {
  let systemMessage = `As a ${role}, your goal is to ${goal}.`;

  model = model || new Model();
  return {
    role,
    goal,
    execute: async (prompt: string) => {
      try {
        const { task, input } = JSON.parse(prompt);
        return model.call(systemMessage, input, tools, getContext());
      } catch (error) {
        return model.call(systemMessage, prompt, tools);
      }
    },
  };
};

export { Agent };
