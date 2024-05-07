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
  try {
    const result = await tools[name](input);
    if (name in context) {
      context[name] = result;
    }
    return result;
  } catch (e) {
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
      console.warn("Error calling function:", name, e.message);
    }
    return "Error calling function " + name + ": " + message;
  }
};

export const getManagerTools = (
  agents: Agents
): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  return agents.map((agent) => {
    const toolName = agent.role.replace(/\s/g, "_").toLowerCase();

    registerTool(toolName, agent.execute);
    context[toolName] = "";

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
  for (const key in context) {
    if (context[key]) {
      currentContext += `${key} Results: ${context[key]}\n`;
    }
  }

  return currentContext;
};
