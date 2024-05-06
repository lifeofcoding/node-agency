import OpenAI from "openai";
import { Model } from "./models/openai";
import { getContext } from "./utils";
import colors from "colors";
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
        const newPrompt = `Complete the following task: ${task} Input: ${input}`;
        console.log(
          colors.yellow(
            `Calling Agent '${role}' with '${systemMessage}'\nWith Input: '${newPrompt}'\n`
          )
        );
        const agentResults = await model.call(
          systemMessage,
          newPrompt,
          tools,
          getContext()
        );
        console.log(
          colors.green(`\nAgent '${role}' Results: ${agentResults}\n\n`)
        );
        return agentResults;
      } catch (error) {
        console.log(
          colors.yellow(
            `Calling Agent '${role}' with '${systemMessage}'\nWith Input: '${prompt}'\n`
          )
        );

        const agentResults = await model.call(systemMessage, prompt, tools);
        console.log(
          colors.green(`\nAgent '${role}' Results: ${agentResults}\n\n`)
        );

        return agentResults;
      }
    },
  };
};

export { Agent };
