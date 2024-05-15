import "dotenv/config";
import { Agency, Agent, Task, Tool, History } from "../../src/index";
import { Model as AgentModel } from "../../src/models/ollama";
import { Model as ManagerModel } from "../../src/models/openai";

/* Create a simple tool */
const SearchTool = async (searchTerms: string) => {
  console.log("Searching for AI advancements related to:", searchTerms);
  return JSON.stringify([
    { id: 1, name: "Google Scholar", url: "https://scholar.google.com/" },
    { id: 2, name: "ArXiv", url: "https://arxiv.org/" },
    {
      id: 3,
      name: "Semantic Scholar",
      url: "https://www.semanticscholar.org/",
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
});

const writer = Agent({
  role: "Tech Content Strategis",
  goal: "Craft compelling content on tech advancements",
  model: new AgentModel({
    model: "llama3:8b",
  }),
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
  llm: new ManagerModel(),
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
