# Node Agency

⚠️ This project is in development and looking for contributors.

Inspired by CrewAI this frameworks goal is to make it easy to use nodejs to build & deploy agents.

This has very basic agent capabilities, and is nowhere near as advanced as many of the other python based libraries, but this will be fun to improve, so anyone who would like to help, you are more than welcome.

## Install

`npm install node-agency`

## Quick Start

```
import "dotenv/config";
import { Agency, Agent, Task, Tool } from "node-agency";
import { Model } from "node-agency/models/openai";

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
});

/* Create Tasks */
const researchTask = Task({
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
  llm: new Model(process.env.OPENAI_API_KEY),
});

/* Kickoff the Agency */
agency.kickoff().then((response) => {
  console.log(response);
});

```

## Features

- Hierarchy agent process
- Asynchronous Tool/Agent Calling
- Sharing of Context between agents
- Easy Defining of custom tools (OpenAI model required, more support coming soon.)

## Supported Models

- OpenAI (Defaults to GPT 3.5-Turbo)
- More coming soon.

## Road Map

- [x] Initial working release
- [x] Self-Reflection
- [ ] Documention
- [ ] Support Ollama Models / Open Source
- [ ] Analytics
- [ ] Chain of thought / Reasoning
