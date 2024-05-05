import { Agent } from "./agent";
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
    }: {
      agent: ReturnType<typeof Agent>;
      context: string;
    }) => {
      const prompt = `Complete the following task: ${description}. ${
        context ? "Here is the context:" + context : ""
      }\n\nExpected Output: ${expectOutput}`;
      if (mainAgent) {
        return mainAgent.execute(prompt);
      }
      return agent.execute(prompt);
    },
  };
};

export { Task };
