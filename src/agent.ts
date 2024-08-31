import OpenAI from "openai";
import { Model as OpenAIModel } from "./models/openai";
import { Model as OllamaModel } from "./models/ollama";
import { Model as ClaudeModel } from "./models/claude";
import { getContext, VectorStore, getEmbeddings } from "./utils";
import { Logger } from "./logger";
type AgentProps =
  | {
      role: string;
      goal: string;
      tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
      model?: OpenAIModel | ClaudeModel;
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

  const getShortTermMemory = async (prompt: string, currentTask: string) => {
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

      prompt += hist.length
        ? "\n\n## Previous History:\n\n" + hist.join("\n\n")
        : "";

      return prompt;
    }

    return prompt;
  };

  const saveShortTermMemories = async (
    agentResults: string,
    currentTask: string
  ) => {
    Logger({
      type: "results",
      payload: JSON.stringify({ role, agentResults }),
    });

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
  };

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

      //combine tools
      tools = tools?.concat(workerTools || []);

      try {
        const { task, input } = JSON.parse(prompt);
        currentTask = `${task}`;
        newPrompt = `Complete the following task: ${task}\n\n## Here is some context to help you with your task:\n${input}`;

        // attach planning prompt
        const containHumanFeedbackTool = tools?.some(
          (tool) => tool.function.name === "human_feedback"
        );

        if (!containHumanFeedbackTool) {
          newPrompt += `\n\n## Please start by planning your approach to the task, and the next steps your should take. If all steps have been completed, please indicate that you are done.`;
        } else {
          newPrompt += `\n\n## Please start by planning your approach to the task, and the next steps your should take. Verify which next steps you should take with the 'human_feedback' tool. If all steps have been completed, please indicate that you are done.`;
        }
      } catch (e) {}

      Logger({
        type: "agent",
        payload: JSON.stringify({ role, systemMessage, newPrompt }),
      });

      // add memories to prompt
      newPrompt = await getShortTermMemory(newPrompt, currentTask);

      const agentResults = await model.call(
        systemMessage,
        { role: "user", content: newPrompt },
        currentTask
          ? tools
          : tools?.filter((tool) => tool.function.name !== "human_feedback"), // remove human feedback tool if executed diirectly
        getContext()
      );
      // model.selfReflected = 0;

      // create short term memory
      saveShortTermMemories(agentResults, currentTask);

      return agentResults;
    },
    executeStream: async (prompt: string) => {
      if ("callStream" in model) {
        let newPrompt = prompt;
        let currentTask: string = "";
        try {
          const { task, input } = JSON.parse(prompt);
          currentTask = `${task}`;
          newPrompt = `Complete the following task: ${task}\n\nHere is some context to help you:\n${input}`;
        } catch (e) {}

        // add memories to prompt
        newPrompt = await getShortTermMemory(newPrompt, currentTask);

        Logger({
          type: "agent",
          payload: JSON.stringify({ role, systemMessage, newPrompt }),
        });

        const agentResults = await model.callStream(
          systemMessage,
          { role: "user", content: newPrompt },
          async (agentResults: string) => {
            // create short term memory
            saveShortTermMemories(agentResults, currentTask);
          },
          currentTask
            ? tools
            : tools?.filter((tool) => tool.function.name !== "human_feedback"), // remove human feedback tool if executed diirectly
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
