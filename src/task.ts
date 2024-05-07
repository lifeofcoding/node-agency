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
      if (mainAgent) {
        return mainAgent.execute(
          JSON.stringify({
            task: description,
            input: context + `\nExpected Output: ${expectOutput}`,
          })
        );
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
