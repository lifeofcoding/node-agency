import { registerTool } from "./utils";
import OpenAI from "openai";

type PARAMS =
  OpenAI.Chat.Completions.ChatCompletionTool["function"]["parameters"];

type ToolProps = {
  run: (input: string) => Promise<string>;
  name: string;
  description: string;
  parameters: PARAMS;
};

export const Tool = ({
  run,
  name,
  description,
  parameters,
}: ToolProps): OpenAI.Chat.Completions.ChatCompletionTool => {
  const toolName = name;
  registerTool(toolName, run);
  return {
    type: "function",
    function: {
      name: toolName,
      description,
      parameters: {
        ...parameters,
      },
    },
  };
};
