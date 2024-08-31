import { Agent } from "./agent";
import { Task } from "./task";
import {
  getManagerTools,
  getCoworkerTools,
  VectorStore,
  getEmbeddings,
  getContent,
  groupIntoNChunks,
  generateOutput,
} from "./utils";
import { Model as OpenAIModel } from "./models/openai";
import { Model as ClaudeModel } from "./models/claude";
import colors from "colors";
import fs from "fs";

type MemoryTrue = { memory: true };
type MemoryFalse = { memory: false };
type MemoryNotSet = { memory?: undefined };
type ProcessHierarchical = { process: "hierarchical" };
type ProcessSequential = { process: "sequential" };
type ProcessNotSet = { process?: undefined };

type AgencyProps = {
  agents: ReturnType<typeof Agent>[];
  tasks: ReturnType<typeof Task>[];
  llm?: OpenAIModel | ClaudeModel;
  process?: "sequential" | "hierarchical";
  memory?: boolean;
  humanFeedback?: boolean;
  outFile?: string;
} & (
  | (MemoryTrue & { resources?: string[] })
  | (MemoryFalse & { resources?: never })
  | (MemoryNotSet & { resources?: never })
) &
  (
    | (ProcessHierarchical & { llm: OpenAIModel })
    | (ProcessSequential & { llm?: never })
    | (ProcessNotSet & { llm: OpenAIModel })
    | (ProcessHierarchical & { llm: ClaudeModel })
    | (ProcessNotSet & { llm: ClaudeModel })
  );

type UserMessage = {
  role: "user" | "assistant";
  content: string;
};

type HistoryItem = UserMessage;
export type History = HistoryItem[];

export const Agency = function ({
  agents,
  tasks,
  llm,
  process = "hierarchical",
  memory = false,
  resources,
  humanFeedback = true,
  outFile,
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
      goal: "Complete the task with the of agents, delegating tasks as needed. Please use the content from tool calls to come up with your final response.",
      tools: getManagerTools(agents, humanFeedback),
      model: llm,
    });

    if (store) {
      manager.memory(store);
    }
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
        agents.filter((agent) => agent.role !== task.agent?.role),
        humanFeedback
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

    if (outFile) {
      console.log(colors.green(`Writing results to file: ${outFile}`));

      // delete file if exists
      if (fs.existsSync(outFile)) {
        fs.unlinkSync(outFile);
      }

      // create directory if not exists
      const paths = outFile.split("/");

      if (paths.length > 1) {
        const dir = paths.slice(0, paths.length - 1).join("/");
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      }
      // write to file
      fs.writeFileSync(outFile, finalOutput, "utf-8");
    }

    return generateOutput(finalOutput, formattedRunTime);
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
          "tool_calls" in item &&
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
