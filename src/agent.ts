import OpenAI from "openai";
import { Model as OpenAIModel } from "./models/openai";
import { Model as OllamaModel } from "./models/ollama";
import { getContext, VectorStore, getEmbeddings } from "./utils";
import { Logger } from "./logger";
type AgentProps =
  | {
      role: string;
      goal: string;
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      model?: OpenAIModel;
    }
  | {
      role: string;
      goal: string;
      tools?: never;
      model?: OllamaModel;
    };

type VectorStoreType = ReturnType<typeof VectorStore> | null;
const Agent = function ({ role, goal, tools, model }: AgentProps) {
  let systemMessage = `As a ${role}, your goal is to ${goal}.`;

  if (tools && model instanceof OllamaModel) {
    throw new Error("OllamaModel cannot have tools");
  }

  model = model || new OpenAIModel();
  let vectorStore: VectorStoreType = null;
  return {
    role,
    goal,
    model,
    memory: (store: VectorStoreType) => {
      vectorStore = store;
    },
    execute: async function (
      prompt: string,
      workerTools?: OpenAI.Chat.Completions.ChatCompletionTool[]
    ) {
      let newPrompt = prompt;
      let currentTask: string = "";

      try {
        const { task, input } = JSON.parse(prompt);
        currentTask = `${task}`;
        newPrompt = `Complete the following task: ${task}\n\n## Here is some context to help you with your task:\n${input}`;

        // attach planning prompt
        newPrompt += `\n\n## Please start by planning your approach to the task, and the next steps your should take. If all steps have been completed, please indicate that you are done.`;
      } catch (e) {}

      Logger({
        type: "agent",
        payload: JSON.stringify({ role, systemMessage, newPrompt }),
      });

      //combine tools
      tools = tools?.concat(workerTools || []);

      if (vectorStore && currentTask) {
        const embeddings = await getEmbeddings(currentTask);
        const em = embeddings.data.map((e) => e.embedding);
        const vectors = vectorStore.similaritySearchVectorWithScore(em[0], 3);
        const hist = vectors.map((v) => {
          const [content] = v;
          return content.pageContent;
        });

        if (hist.length) {
          Logger({
            type: "info",
            payload:
              "Found memories for task: " +
              currentTask +
              "\n\nMemories:\n" +
              hist.join("\n\n"),
          });
        }

        newPrompt += hist.length
          ? "\n\n## Previous History:\n\n" + hist.join("\n\n")
          : "";
      }

      const agentResults = await model.call(
        systemMessage,
        { role: "user", content: newPrompt },
        tools,
        getContext()
      );
      // model.selfReflected = 0;

      // create short term memory
      if (vectorStore) {
        const embeddings = await getEmbeddings(agentResults);
        const em = embeddings.data.map((e) => e.embedding);
        vectorStore.addVectors(em, [
          {
            pageContent: agentResults,
            metadata: {
              role,
              task: currentTask,
            },
          },
        ]);
      }

      Logger({
        type: "results",
        payload: JSON.stringify({ role, agentResults }),
      });
      return agentResults;
    },
    executeStream: async (prompt: string) => {
      if (model instanceof OpenAIModel) {
        let newPrompt = prompt;
        let currentTask: string = "";
        try {
          const { task, input } = JSON.parse(prompt);
          currentTask = `${task}`;
          newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
        } catch (e) {}

        if (vectorStore && currentTask) {
          const embeddings = await getEmbeddings(currentTask);
          const em = embeddings.data.map((e) => e.embedding);
          const vectors = vectorStore.similaritySearchVectorWithScore(em[0], 3);
          const hist = vectors.map((v) => {
            const [content] = v;
            return content.pageContent;
          });

          newPrompt += hist.length
            ? "\n\nHistory:\n\n" + hist.join("\n\n")
            : "";
        }

        Logger({
          type: "agent",
          payload: JSON.stringify({ role, systemMessage, newPrompt }),
        });

        const agentResults = await model.callStream(
          systemMessage,
          { role: "user", content: newPrompt },
          tools,
          getContext()
        );

        return agentResults;
      } else {
        throw new Error("Model does not support streaming");
      }
    },
  };
};

export { Agent };
