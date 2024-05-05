import { Agent } from "./agent";
import { Task } from "./task";
import { getManagerTools } from "./utils";
import { Model } from "./models/openai";

type AgencyProps = {
  agents: ReturnType<typeof Agent>[];
  tasks: ReturnType<typeof Task>[];
  llm: Model;
};

export const Agency = function ({ agents, tasks, llm }: AgencyProps) {
  const manager = Agent({
    role: "Supervising Manager",
    goal: "Complete the task",
    tools: getManagerTools(agents),
    model: llm,
  });

  const kickoff = async () => {
    let output = "";
    for (const task of tasks) {
      output += await task.execute({ agent: manager, context: output });
    }

    return output;
  };

  return {
    kickoff,
  };
};
