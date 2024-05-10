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
      agent = agent || mainAgent;

      if (!agent) {
        throw new Error("No agent provided");
      }

      return agent.execute(
        JSON.stringify({
          task: description,
          input: context + `\nExpected Output: ${expectOutput}`,
        })
      );
    },
  };
};

export { Task };
