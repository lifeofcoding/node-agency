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
    model,
    execute: async (prompt: string) => {
      let newPrompt = prompt;
      try {
        const { task, input } = JSON.parse(prompt);
        newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
      } catch (e) {}

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
    },
    executeStream: async (prompt: string) => {
      let newPrompt = prompt;
      try {
        const { task, input } = JSON.parse(prompt);
        newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
      } catch (e) {}

      console.log(
        colors.yellow(`Calling Agent`),
        colors.blue(`${role}`),
        `with`,
        colors.blue(`'${systemMessage}'`),
        `\nWith Input:`,
        colors.blue(`'${newPrompt}'\n`)
      );
      const agentResults = await model.callStream(
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
    },
  };
};

export { Agent };
