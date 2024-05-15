import { Agent } from "./agent";
import { Task } from "./task";
import { getManagerTools } from "./utils";
import { Model as OpenAIModel } from "./models/openai";
import colors from "colors";

type AgencyProps = {
  agents: ReturnType<typeof Agent>[];
  tasks: ReturnType<typeof Task>[];
  llm: OpenAIModel;
};
type UserMessage = {
  role: "user" | "assistant";
  content: string;
};

type HistoryItem = UserMessage;
export type History = HistoryItem[];

const groupIntoNChunks = (arr: any, chunkSize: number) => {
  const result = new Array(chunkSize).fill([]);
  const amountPerChunk = arr.length / chunkSize;

  const chunkAmount = amountPerChunk < 3 ? 3 : amountPerChunk;
  for (let i = result.length; i > 0; i--) {
    let beginPointer = (result.length - i) * chunkAmount;
    result[result.length - i] = arr.slice(
      beginPointer,
      beginPointer + chunkAmount
    );
  }
  return result;
};

export const Agency = function ({ agents, tasks, llm }: AgencyProps) {
  llm.isManager = true;

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

    console.log(colors.green("\nAgency Completed!\n\n"));

    return `\n\n-----------------\n\nFinalt Results: ${output}`;
  };

  const run = async <T extends boolean>(
    prompt: string,
    stream: T,
    history?: History
  ): Promise<
    T extends true ? Awaited<ReturnType<OpenAIModel["callStream"]>> : string
  > => {
    const executeMethod = stream ? "executeStream" : "execute";

    if (history) {
      const newHistory = history.map((item) => {
        return { role: item.role, content: item.content };
      }) as OpenAIModel["history"];

      const currentToolCalls = manager.model.history.filter(
        (item) =>
          item.role === "assistant" &&
          item.tool_calls &&
          item.tool_calls.length > 0
      );

      const [firstHistoryItems, middleHistoryItems, lastHistoryItems] =
        groupIntoNChunks(newHistory, 3);

      manager.model.history = [
        ...firstHistoryItems,
        ...currentToolCalls,
        ...middleHistoryItems,
        ...lastHistoryItems,
      ];
    }

    return (await manager[executeMethod](prompt)) as T extends true
      ? Awaited<ReturnType<OpenAIModel["callStream"]>>
      : string;
  };

  const execute = async (prompt: string, history?: History) => {
    return run(prompt, false, history);
  };

  const executeStream = async (prompt: string, history?: History) => {
    return run(prompt, true, history);
  };

  return {
    kickoff,
    execute,
    executeStream,
  };
};
