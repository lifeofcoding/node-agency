import OpenAI from "openai";
import { Model as OpenAIModel } from "./models/openai";
import { Model as OllamaModel } from "./models/ollama";
import { getContext } from "./utils";
import colors from "colors";
import { Logger } from "./logger";
type AgentProps =
  | {
      role: string;
      goal: string;
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      model?: OpenAIModel;
    }
  | {
      role: string;
      goal: string;
      tools?: never;
      model?: OllamaModel;
    };
const Agent = function ({ role, goal, tools, model }: AgentProps) {
  let systemMessage = `As a ${role}, your goal is to ${goal}.`;

  if (tools && model instanceof OllamaModel) {
    throw new Error("OllamaModel cannot have tools");
  }

  model = model || new OpenAIModel();
  return {
    role,
    goal,
    model,
    execute: async (prompt: string) => {
      let newPrompt = prompt;
      try {
        const { task, input } = JSON.parse(prompt);
        newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
      } catch (e) {}

      Logger({
        type: "agent",
        payload: JSON.stringify({ role, systemMessage, newPrompt }),
      });

      const agentResults = await model.call(
        systemMessage,
        { role: "user", content: newPrompt },
        tools,
        getContext()
      );
      // model.selfReflected = 0;

      Logger({
        type: "results",
        payload: JSON.stringify({ role, agentResults }),
      });
      return agentResults;
    },
    executeStream: async (prompt: string) => {
      if (model instanceof OpenAIModel) {
        let newPrompt = prompt;
        try {
          const { task, input } = JSON.parse(prompt);
          newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
        } catch (e) {}

        Logger({
          type: "agent",
          payload: JSON.stringify({ role, systemMessage, newPrompt }),
        });

        const agentResults = await model.callStream(
          systemMessage,
          { role: "user", content: newPrompt },
          tools,
          getContext()
        );
        return agentResults;
      } else {
        throw new Error("Model does not support streaming");
      }
    },
  };
};

export { Agent };
