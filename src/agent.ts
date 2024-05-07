import OpenAI from "openai";
import { Model } from "./models/openai";
import { getContext } from "./utils";
import colors from "colors";
type AgentProps = {
  role: string;
  goal: string;
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  model?: Model;
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
        const newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;

        console.log(
          colors.yellow(`Calling Agent`),
          colors.blue(`${role}`),
          `with`,
          colors.blue(`'${systemMessage}'`),
          `\nWith Input:`,
          colors.blue(`'${newPrompt}'\n`)
        );
        const agentResults = await model.call(
          systemMessage,
          { role: "user", content: newPrompt },
          tools,
          getContext()
        );
        // model.selfReflected = 0;
        console.log(
          colors.yellow(`\nAgent`),
          colors.blue(`'${role}'`),
          `Results:\n`,
          colors.blue(`${agentResults}\n\n`)
        );
        return agentResults;
      } catch (error) {
        console.log(
          colors.yellow(`Calling Agent`),
          colors.blue(`${role}`),
          `with`,
          colors.blue(`'${systemMessage}'`),
          `\nWith Input:`,
          colors.blue(`'${prompt}'\n`)
        );

        const agentResults = await model.call(
          systemMessage,
          { role: "user", content: prompt },
          tools
        );
        // model.selfReflected = 0;
        console.log(
          colors.yellow(`\nAgent`),
          colors.blue(`'${role}'`),
          `Results:\n`,
          colors.blue(`${agentResults}\n\n`)
        );

        return agentResults;
      }
    },
  };
};

export { Agent };
