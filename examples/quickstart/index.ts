import "dotenv/config";
import { Agency, Agent, Task, Tool, History } from "../../src/index";
import { Model } from "../../src/models/openai";

/* Create a simple tool */
const SearchTool = async (searchTerms: string) => {
  console.log("Searching for AI advancements related to:", searchTerms);
  return JSON.stringify([
    {
      id: 1,
      name: "Google Scholar",
      url: "https://scholar.google.com/",
      content:
        "The latest OpenAI Sora Model shocks the internet with its capabilities. The model is capable of generating human-like video with minimal prompts. The model is expected to revolutionize the field of AI and video. The model is available on the OpenAI API.",
    },
    {
      id: 2,
      name: "ArXiv",
      url: "https://arxiv.org/",
      content:
        "The latest Google release Gemini Pro 1.5 have 2 million token context window. They also release vemo for video generation that outputs 1080p long form video.",
    },
    {
      id: 3,
      name: "Semantic Scholar",
      url: "https://www.semanticscholar.org/",
      content:
        "The latest advancements in AI include the release of the OpenAI Sora Model and the Google Gemini Pro 1.5. As well as new ChatGPTo multimodel from OpenAI. That can reason across multiple modalities.",
    },
  ]);
};

/* Register Tool */
const searchTool = Tool({
  name: "search_tool",
  run: SearchTool,
  description: "Search for AI advancements",
  parameters: {
    type: "object",
    properties: {
      searchTerms: {
        type: "string",
        description: "Search query for AI advancements",
      },
    },
    required: ["searchTerms"],
  },
});

/* Create Agents */
const researcher = Agent({
  role: "Senior Research Analyst",
  goal: "Uncover cutting-edge developments in AI and data science",
  tools: [searchTool],
  // model: new Model() // You can also pass a model here
});

const writer = Agent({
  role: "Tech Content Strategis",
  goal: "Craft compelling content on tech advancements",
});

/* Create Tasks */
const researchTask = Task({
  // agent: researcher, // You can also pass the agent here
  expectOutput: "Full analysis report in bullet points",
  description:
    "Conduct a comprehensive analysis of the latest advancements in AI in 2024. Identify key trends, breakthrough technologies, and potential industry impacts.",
});

const summaryTask = Task({
  expectOutput: "Full blog post of at least 4 paragraphs",
  description: `Using the insights provided, develop an engaging blog
  post that highlights the most significant AI advancements.
  Your post should be informative yet accessible, catering to a tech-savvy audience.
  Make it sound cool, avoid complex words so it doesn't sound like AI.`,
});

/* Create Agency */
const agency = Agency({
  agents: [researcher, writer],
  tasks: [researchTask, summaryTask],
  memory: true,
  llm: new Model({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    model: "gpt-3.5-turbo",
    parallelToolCalls: true,
  }),
  outFile: "output.txt",
});

/* Kickoff the Agency */
agency.kickoff().then((response) => {
  console.log(response);
});

/* Advance chatbot agent */
/* With Streaming */
/*
agency
  .executeStream(
    "What are the latest AI advancements?, and what advancements are there in self-driving cars?"
  )
  .then(async (response) => {
    for await (const part of response) {
        process.stdout.write(part);
    }
  });
*/
/* Without Streaming */
/*
agency.execute("hello").then((response) => {
  console.log(response);
});
*/

/* With History */
/*
agency
  .execute("hello", [
    { role: "user", content: "Hello" },
    { role: "assistant", content: "How can I help you?" },
    { role: "user", content: "What is the largest city in Florida?" },
    {
      role: "assistant",
      content: "The largest city in Florida is Jacksonville.",
    },
  ] as History)
  .then((response) => {
    console.log(response);
  });
*/
