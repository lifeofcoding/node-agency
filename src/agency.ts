import { Agent } from "./agent";
import { Task } from "./task";
import {
  getManagerTools,
  getCoworkerTools,
  VectorStore,
  getEmbeddings,
  getContent,
} from "./utils";
import { Model as OpenAIModel } from "./models/openai";
import colors from "colors";

type MemoryTrue = { memory: true };
type MemoryFalse = { memory: false };
type MemoryNotSet = { memory?: undefined };

type AgencyProps = {
  agents: ReturnType<typeof Agent>[];
  tasks: ReturnType<typeof Task>[];
  llm: OpenAIModel;
  process?: "sequential" | "hierarchical";
  memory?: boolean;
} & (
  | (MemoryTrue & { resources?: string[] })
  | (MemoryFalse & { resources?: never })
  | (MemoryNotSet & { resources?: never })
);

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

export const Agency = function ({
  agents,
  tasks,
  llm,
  process = "hierarchical",
  memory = false,
  resources,
}: AgencyProps) {
  let manager: ReturnType<typeof Agent> | undefined;
  let store: ReturnType<typeof VectorStore> | undefined;

  if (memory) {
    store = VectorStore();
  }

  if (llm && process === "hierarchical") {
    llm.isManager = true;

    manager = Agent({
      role: "Supervising Manager",
      goal: "Complete the task with the of agents, delegating tasks as needed. Please use the results from the agent to come up with the final output.",
      tools: getManagerTools(agents),
      model: llm,
    });

    if (store) {
      manager.memory(store);
    }
  } else {
    manager = undefined;
  }

  if (store) {
    agents.forEach((agent) => agent.memory(store));
  }

  if (resources && !store) {
    throw new Error(
      "Resources can only be used with memory enabled. Please enable memory to use resources."
    );
  }

  if (resources && store) {
    resources.forEach(async (resource) => {
      if (store) {
        const resourceContent = await getContent(resource);

        for (const content of resourceContent) {
          const embeddings = await getEmbeddings(content);
          const emb = embeddings.data.map((e) => e.embedding);
          store.addVectors(emb, [
            {
              pageContent: content,
              metadata: {
                type: "resource",
                tags: [resource],
              },
            },
          ]);
        }
      }
    });
  }

  const kickoff = async () => {
    console.log(colors.green("Starting Agency...\n\n"));
    let context = "";
    let finalOutput = "";
    const startTime = new Date().getTime();
    for (const task of tasks) {
      const coworkerTools = getCoworkerTools(
        agents.filter((agent) => agent.role !== task.agent?.role)
      );
      const out = await task.execute({
        agent: manager,
        context,
        tools: process !== "hierarchical" ? coworkerTools : undefined,
      });
      if (memory) {
        // TODO: store in longterm memory using sqlite
      }
      context += `${out}\n-----------------\n`;
      finalOutput = out;
    }
    const endTime = new Date().getTime();

    const runTime = endTime - startTime;
    const formattedRunTime = `${Math.floor(
      runTime / 60000
    )} minutes and ${Math.floor((runTime % 60000) / 1000)} seconds`;

    console.log(colors.green("\nAgency Completed!\n\n"));

    return `\n\n-----------------\n\nFinalt Results: ${finalOutput}\n\n-----------------\n\nRun time: ${formattedRunTime}\n\n-----------------\n\n`;
  };

  const run = async <T extends boolean>(
    prompt: string,
    stream: T,
    history?: History
  ): Promise<
    T extends true ? Awaited<ReturnType<OpenAIModel["callStream"]>> : string
  > => {
    if (!manager) {
      throw new Error(
        "Manager is not defined. Please provide a manager model to run the agency in chatbot mode."
      );
    }
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
