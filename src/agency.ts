import { Agent } from "./agent";
import { Task } from "./task";
import { getManagerTools } from "./utils";
import { Model } from "./models/openai";
import colors from "colors";

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
    console.log(colors.green("Starting Agency...\n\n"));
    let output = "";
    for (const task of tasks) {
      const out = await task.execute({ agent: manager, context: output });
      output += `${out}\n-----------------\n`;
    }

    return `\n\n-----------------\n\nFinalt Results: ${output}`;
  };

  return {
    kickoff,
  };
};
