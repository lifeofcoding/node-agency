import { Agent } from "./agent";
import OpenAI from "openai";
import { VectorStore } from "./utils";
type TaskProps = {
  description: string;
  agent?: ReturnType<typeof Agent>;
  expectOutput: string;
};
const Task = ({ description, agent: mainAgent, expectOutput }: TaskProps) => {
  return {
    description,
    agent: mainAgent,
    expectOutput,
    execute: async ({
      agent,
      context,
      tools,
    }: {
      agent?: ReturnType<typeof Agent>;
      context: string;
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
    }) => {
      agent = agent || mainAgent;

      if (!agent) {
        throw new Error("No agent provided");
      }

      return agent.execute(
        JSON.stringify({
          task: description,
          input: context + `\nExpected Output: ${expectOutput}`,
        }),
        tools
      );
    },
  };
};

export { Task };
