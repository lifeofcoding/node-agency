import OpenAI from "openai";
import { Agent } from "./agent";

type Agents = ReturnType<typeof Agent>[];

const tools: { [key: string]: (prompt: string) => Promise<string> } = {};
const context: { [key: string]: string } = {};

export const registerTool = (
  name: string,
  execute: (prompt: string) => Promise<string>
) => {
  tools[name] = execute;
};

export const callFunction = async (name: string, input: string) => {
  const result = await tools[name](input);
  context[name] = result;
  return result;
};

export const getManagerTools = (
  agents: Agents
): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  return agents.map((agent) => {
    const toolName = agent.role.replace(/\s/g, "_").toLowerCase();

    registerTool(toolName, agent.execute);

    return {
      type: "function",
      function: {
        name: toolName,
        description: agent.goal,
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "Task for the agent to complete",
            },
            input: {
              type: "string",
              description:
                "The required input for the Agent to complete their task",
            },
          },
          required: ["task", "input"],
        },
      },
    };
  });
};

export const getContext = () => {
  let currentContext = "";
  for (const key in tools) {
    currentContext += `${key} Results: ${context[key] || "Pending..."}\n`;
  }

  return "";
};
