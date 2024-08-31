import "dotenv/config";
import { Agency, Agent, Task, Tool } from "../../src/index";
import { Model as AgentModel } from "../../src/models/claude";
import { Model as ManagerModel } from "../../src/models/claude";

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
});

const writer = Agent({
  role: "Tech Content Strategis",
  goal: "Craft compelling content on tech advancements",
  model: new AgentModel({
    model: "claude-3-opus-20240229",
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
  humanFeedback: false,
});

/* Kickoff the Agency */
agency.kickoff().then((response) => {
  console.log(response);
});
