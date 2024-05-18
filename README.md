# Node Agency

⚠️ This project is in development and looking for contributors.

Inspired by CrewAI this frameworks goal is to make it easy to use nodejs to build & deploy agents.

This has very basic agent capabilities, and is nowhere near as advanced as many of the other python based libraries, but this will be fun to improve, so anyone who would like to help, you are more than welcome.

## Install

`npm install node-agency`

## Features

- Hierarchy & Seqential agent process
- Asynchronous Tool Calling
- Sharing of Context between agents
- Short Term Memory (RAG)
- Task delegation and communication between agents
- Easily add PDF's & websites as resources
- Easy Defining of custom tools (OpenAI model required, more support coming soon.)

## Quick Start

```
import "dotenv/config";
import { Agency, Agent, Task, Tool } from "node-agency";
import { Model as OpenAIModel } from "node-agency/models/openai";
import { Model as OllamaModel } from "node-agency/models/ollama";

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
  // model: new OpenAIModel() // You can also pass a model here
});

const writer = Agent({
  role: "Tech Content Strategis",
  goal: "Craft compelling content on tech advancements",
  model: new OllamaModel({
    model: "llama3",
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
  llm: new OpenAIModel({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    model: "gpt-3.5-turbo",
    parallelToolCalls: true,
  }),
});

/* Kickoff the Agency */
agency.kickoff().then((response) => {
  console.log(response);
});

```

## Seqential Process

```
const agency = Agency({
  agents: [researcher, writer],
  tasks: [researchTask, summaryTask],
  llm: new Model({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    model: "gpt-3.5-turbo",
    parallelToolCalls: true,
  }),
  process: "sequential",
  memory: true,
});
```

## Add RAG Knowledge with Resources

```
const agency = Agency({
  agents: [researcher, writer],
  tasks: [researchTask, summaryTask],
  resources: [
    "https://www.wbu.edu/academics/writing-center/documents/Converting%20Google%20and%20Word%20Docs.pdf",
    "https://react.dev/reference/react",
  ],
  memory: true, // memory required for resources
  llm: new Model({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    model: "gpt-3.5-turbo",
    parallelToolCalls: true,
  }),
});
```

## Memory (Short-term)

```
const agency = Agency({
  agents: [researcher, writer],
  tasks: [researchTask, summaryTask],
  memory: true,
  llm: new Model({
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || "",
    model: "gpt-3.5-turbo",
    parallelToolCalls: true,
  }),
});
```

## Advanced: Chatbot Functionality

`With Streaming:`

```
agency
  .executeStream(
    "What are the latest AI advancements?, and what advancements are there in self-driving cars?"
  )
  .then(async (response) => {
    for await (const part of response) {
      process.stdout.write(part);
    }
  });
```

`Without Streaming:`

```
agency.execute("hello").then((response) => {
  console.log(response);
});
```

`With External History:`

```
import { History } from "node-agency"; // Import History Type

...

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
```

## Supported Models

- OpenAI (Defaults to GPT 3.5-Turbo)
- Ollama (Tools not supported yet)
- More coming soon.

## Road Map

- [x] Initial working release
- [x] Self-Reflection
- [x] Support Ollama Models / Open Source
- [x] Short term memory (RAG)
- [x] Chatbot RAG support
- [ ] Allow connecting to external vector store databases (Pinecone, Postgres, Supabase)
- [ ] Long-term memory (SQLlite)
- [ ] Ollama Function Calling Support
- [ ] Groq Support
- [ ] Documention
- [ ] Analytics
- [ ] Chain of thought / Reasoning
