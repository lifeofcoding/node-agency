import OpenAI from "openai";
import { similarity as ml_distance_similarity } from "ml-distance";
import { Agent } from "./agent";
import PDF from "pdf-parse";
import axios from "axios";
import * as cheerio from "cheerio";

type Agents = ReturnType<typeof Agent>[];

const tools: { [key: string]: (prompt: string) => Promise<string> } = {};
const context: { [key: string]: string } = {};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const getEmbeddings = async (content: string) => {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: content,
    encoding_format: "float",
  });

  return embedding;
};

let totalPages: string[] = [];
const pages: string[] = [];

const isValidLink = (link: string) => {
  return (
    !link.includes(".css") &&
    !link.includes(".js") &&
    !link.includes(".png") &&
    !link.includes(".jpg") &&
    !link.includes(".jpeg") &&
    !link.includes(".gif") &&
    !link.includes(".svg") &&
    !link.includes(".ico") &&
    !link.includes(".xml") &&
    !link.includes(".json")
  );
};

const cleanSourceText = (text: string) => {
  return text
    .trim()
    .replace(/(\n){4,}/g, "\n\n\n")
    .replace(/\n\n/g, " ")
    .replace(/ {3,}/g, "  ")
    .replace(/\t/g, "")
    .replace(/\n+(\s*\n)*/g, "\n");
};

const crawlWebsite = async (
  url: string,
  depth: number,
  currentDepth = 0
): Promise<string[]> => {
  try {
    const domain = new URL(url).origin;
    const response = await axios.get(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/109.0",
      },
    });
    const $ = cheerio.load(response.data);

    const body = $("body").text();

    const links = $("a")
      .map((_, el) => domain + $(el).attr("href"))
      .get();

    function onlyUnique(value: string, index: number, array: string[]) {
      return array.indexOf(value) === index;
    }

    const unique = links.filter(onlyUnique);
    const newPages = unique.filter((link) => isValidLink(link)) || [];

    const filteredLinks = newPages.filter((link, idx) => {
      try {
        const domain = new URL(link).hostname;

        if (link.includes(".pdf")) return false;

        const excludeList = [
          "google",
          "facebook",
          "twitter",
          "instagram",
          "youtube",
          "tiktok",
        ];
        if (excludeList.some((site) => domain.includes(site))) return false;

        return link.includes(domain);
      } catch (e) {
        return false;
      }
    });

    if (newPages) {
      totalPages = totalPages.concat(filteredLinks).filter(onlyUnique);
    }

    pages.push(cleanSourceText(body));

    if (currentDepth >= depth) {
      return pages;
    }

    const nextPage = totalPages.shift();

    if (!nextPage) {
      return pages;
    }
    return crawlWebsite(nextPage, depth, currentDepth + 1);
  } catch (e) {
    const nextPage = totalPages.shift();

    if (!nextPage) {
      return pages;
    }
    return crawlWebsite(nextPage, depth, currentDepth + 1);
  }
};

const isPDF = (url: string) => url.endsWith(".pdf");
// const stripHtml = (html: string) => html.replace(/<[^>]*>?/gm, " ");
// const onlyAplhaNumeric = (text: string) => text.replace(/[^a-zA-Z0-9 ]/g, " ");
const chunkText = (text: string, chunkSize: number) => {
  const chunks: string[] = [];
  const words = text
    .replace(/\n/g, "")
    .split(" ")
    .filter((w) => w.length > 0);
  let currentChunk = "";
  for (let i = 0; i < words.length; i++) {
    if (currentChunk.length + 1 + words[i].length < chunkSize) {
      if (currentChunk.length > 0) {
        currentChunk += " ";
      }
      currentChunk += words[i];
    } else {
      chunks.push(currentChunk);
      currentChunk = "";

      if (i < words.length) {
        currentChunk = words[i];
      }
    }
  }

  return chunks;
};

export const getContent = async (url: string) => {
  if (isPDF(url)) {
    const pdf = await fetch(url);
    const pdfBuffer = await pdf.arrayBuffer();
    const buffer = Buffer.from(pdfBuffer);
    const pdfText = await PDF(buffer);
    const chunks = chunkText(pdfText.text, 500);
    return chunks;
  }

  const pages = await crawlWebsite(url, 10);

  debugger;

  const chunks = chunkText(pages.join(" "), 800);

  return chunks;
};

interface MemoryVector {
  content: string;
  embedding: number[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: Record<string, any>;
}

export function VectorStore() {
  let memoryVectors: MemoryVector[] = [];
  const similaritySearchVectorWithScore = (query: number[], k: number) => {
    const similarity = ml_distance_similarity.cosine;

    const filter = (doc: {
      metadata: Record<string, any>;
      pageContent: string;
    }) => true;

    const filterFunction = (memoryVector: MemoryVector) => {
      if (!filter) {
        return true;
      }
      const doc = {
        metadata: memoryVector.metadata,
        pageContent: memoryVector.content,
      };
      return filter(doc);
    };
    const filteredMemoryVectors = memoryVectors.filter(filterFunction);
    const searches = filteredMemoryVectors
      .map((vector, index) => ({
        similarity: similarity(query, vector.embedding),
        index,
      }))
      .sort((a, b) => (a.similarity > b.similarity ? -1 : 0))
      .slice(0, k);

    const result: [
      { metadata: Record<string, any>; pageContent: string },
      number
    ][] = searches.map((search) => [
      {
        metadata: filteredMemoryVectors[search.index].metadata,
        pageContent: filteredMemoryVectors[search.index].content,
      },
      search.similarity,
    ]);

    return result;
  };

  return {
    addVectors: (
      vectors: number[][],
      documents: { pageContent: string; metadata: Record<string, any> }[]
    ) => {
      const memory = vectors.map((embedding, idx) => ({
        content: documents[idx].pageContent,
        embedding,
        metadata: documents[idx].metadata,
      }));

      memoryVectors = memoryVectors.concat(memory);
    },
    similaritySearchVectorWithScore,
  };
}

export function readableStreamAsyncIterable<T>(
  stream: any
): AsyncIterableIterator<T> {
  if (stream[Symbol.asyncIterator]) return stream;

  const reader = stream.getReader();
  return {
    async next() {
      try {
        const result = await reader.read();
        if (result?.done) reader.releaseLock(); // release lock when stream becomes closed
        return result;
      } catch (e) {
        reader.releaseLock(); // release lock when stream becomes errored
        throw e;
      }
    },
    async return() {
      const cancelPromise = reader.cancel();
      reader.releaseLock();
      await cancelPromise;
      return { done: true, value: undefined };
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

export const registerTool = (
  name: string,
  execute: (prompt: string) => Promise<string>
) => {
  tools[name] = execute;
};

export const callFunction = async (name: string, input: string) => {
  try {
    const result = await tools[name](input);
    if (name in context) {
      context[name] = result;
    }
    return result;
  } catch (e) {
    let message = "Unknown error";
    if (e instanceof Error) {
      message = e.message;
      console.warn("Error calling function:", name, e.message);
    }
    return "Error calling function " + name + ": " + message;
  }
};

export const getCoworkerTools = (
  agents: Agents
): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  const tools = [
    {
      type: "function",
      function: {
        name: "ask_question",
        description: `Ask a specific question to one of the following co-workers: ${agents
          .map((a) => `"${a.role.replace(/\s/g, "_").toLowerCase()}"`)
          .join(
            ","
          )}\nThe input to this tool should be the co-worker, the question you have for them, and ALL necessary context to ask the question properly, they know nothing about the question, so share absolute everything you know, don't reference things but instead explain them.`,
        parameters: {
          type: "object",
          properties: {
            question: {
              type: "string",
              description: "The question to ask the coworker",
            },
            coworker: {
              type: "string",
              description: "The coworker to ask the question to",
            },
            context: {
              type: "string",
              description: "Any required context for the coworker",
            },
          },
          required: ["question", "coworker", "context"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "delegate_task",
        description: `Delegate a specific task to one of the following co-workers: ${agents
          .map((a) => `"${a.role.replace(/\s/g, "_").toLowerCase()}"`)
          .join(
            ","
          )}\nThe input to this tool should be the co-worker, the task you want them to do, and ALL necessary context to execute the task, they know nothing about the task, so share absolute everything you know, don't reference things but instead explain them.`,
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "The task to delegate to the coworker",
            },
            coworker: {
              type: "string",
              description: "The coworker to delegate task to",
            },
            context: {
              type: "string",
              description: "Any required context for the coworker",
            },
          },
          required: ["task", "coworker", "context"],
        },
      },
    },
  ];

  registerTool("ask_question", async (prompt) => {
    try {
      const { question, coworker, context } = JSON.parse(prompt);
      const coworkerAgent = agents.find(
        (a) => a.role.replace(/\s/g, "_").toLowerCase() === coworker
      );
      if (!coworkerAgent) {
        throw new Error(`Could not find coworker with role: ${coworker}`);
      }
      return await coworkerAgent.execute(
        JSON.stringify({
          task: `Answer the following question: ${question}`,
          input: context,
        })
      );
    } catch (e) {
      console.warn("Error calling ask_question", e);
      if (e instanceof Error) return "Error calling ask_question: " + e.message;
      return "Error calling ask_question";
    }
  });
  registerTool("delegate_task", async (prompt) => {
    try {
      const { task: delegateTask, coworker, context } = JSON.parse(prompt);
      const coworkerAgent = agents.find(
        (a) => a.role.replace(/\s/g, "_").toLowerCase() === coworker
      );
      if (!coworkerAgent) {
        throw new Error(`Could not find coworker with role: ${coworker}`);
      }
      return await coworkerAgent.execute(
        JSON.stringify({
          task: delegateTask,
          input: context,
        })
      );
    } catch (e) {
      console.warn("Error calling delegate_task", e);
      if (e instanceof Error)
        return "Error calling delegate_task: " + e.message;
      return "Error calling delegate_task";
    }
  });

  return tools as OpenAI.Chat.Completions.ChatCompletionTool[];
};

export const getManagerTools = (
  agents: Agents
): OpenAI.Chat.Completions.ChatCompletionTool[] => {
  return agents.map((agent) => {
    const toolName = agent.role.replace(/\s/g, "_").toLowerCase();

    registerTool(toolName, agent.execute);
    context[toolName] = "";

    return {
      type: "function",
      function: {
        name: toolName,
        description: agent.goal,
        parameters: {
          type: "object",
          properties: {
            task: {
              type: "string",
              description: "Task for the agent to complete",
            },
            input: {
              type: "string",
              description:
                "The required input for the Agent to complete their task",
            },
          },
          required: ["task", "input"],
        },
      },
    };
  });
};

export const generateOutput = (
  finalOutput: string,
  formattedRunTime: string
) => {
  return `\n\n-----------------\n\nFinalt Results: ${finalOutput}\n\n-----------------\n\nRun time: ${formattedRunTime}\n\n-----------------\n\n`;
};

export const groupIntoNChunks = (arr: any, chunkSize: number) => {
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

export const getContext = () => {
  let currentContext = "";
  for (const key in context) {
    if (context[key]) {
      currentContext += `${key} Results: ${context[key]}\n`;
    }
  }

  return currentContext;
};
