import OpenAI from "openai";
import { Logger } from "../logger";

const getToolsPrompt = (
  tools: OpenAI.Chat.Completions.ChatCompletionTool[] | undefined
) => {
  let toolsPrompt = "";

  if (tools) {
    toolsPrompt =
      "\n\nYou have Tools Available Please tell me when to use them:\n";
    tools.forEach((tool) => {
      toolsPrompt += `\nName: ${tool.function.name}`;
      toolsPrompt += `\nDescription: ${tool.function.description}`;
      if (tool.function.parameters) {
        if (tool.function.parameters.type) {
          toolsPrompt += `\nParameter Type: ${tool.function.parameters.type}`;
        }
        if (
          tool.function.parameters.required &&
          Array.isArray(tool.function.parameters.required)
        ) {
          toolsPrompt += `\nRequired Parameters: ${tool.function.parameters.required.join(
            ","
          )}`;
        }
        if (tool.function.parameters.properties) {
          let outputJson = `{`;
          outputJson += `'tool_call':'${tool.function.name}',`;
          outputJson += `'arguments': {`;
          let count = 0;
          for (const [key, value] of Object.entries(
            tool.function.parameters.properties
          )) {
            if (count > 0) outputJson += `,`;

            let valueExample = "";
            if (value.type === "string") {
              valueExample = `'example'`;
            }
            if (value.type === "number") {
              valueExample = `0`;
            }
            outputJson += `'${key}': ${valueExample}`;
            count++;
          }
          outputJson += `}}`;
          toolsPrompt += `\nExample of Calling Tool: ${outputJson}`;
        }
      }
    });
  }

  return toolsPrompt;
};

type OpenAIParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParams.ChatCompletionCreateParamsNonStreaming;
type Messages = OpenAIParams["messages"];
type Message = Messages[0];

type ResponseTypeNonStreaming = {
  model: string;
  created_at: string;
  message: {
    role: "assistant";
    content: string;
  };
  done: true;
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
  error?: string;
};

export class Model {
  history: Messages = [];
  selfReflected: number = 0;
  model: string = "llama3";
  constructor(options?: { model?: string }) {
    const { model } = options || {};
    this.model = model || this.model;
  }
  async call(
    systemMessage: string,
    prompt: Message,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    context?: string
  ): Promise<string> {
    prompt.content =
      prompt.content +
      (context
        ? "\n\nHere is further context to help you with your task:\n" + context
        : "");

    this.history.push(prompt);
    const messages: Messages = [
      {
        role: "system",
        content: systemMessage + getToolsPrompt(tools),
      },
      ...this.history,
    ];

    try {
      const message = await this.callOllama(messages, tools);

      this.history.push({
        role: "assistant",
        content: message.content,
      });

      return message.content || "Unknown Error Occurred, Please try again.";
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call GPT-3");
    }
  }

  async callOllama(
    messages: Messages,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    reflected: boolean = false
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    try {
      const modelResponse: ResponseTypeNonStreaming = await fetch(
        `http://localhost:11434/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages,
            model: this.model,
            stream: false,
          }),
        }
      ).then((res) => res.json());

      if (modelResponse.error) {
        throw new Error(modelResponse.error);
      }

      const { message } = modelResponse;

      if (reflected && this.selfReflected >= 3) {
        Logger({ type: "info", payload: "Self-Reflection Limit Reached\n\n" });
      }

      if (!reflected && message.content && this.selfReflected < 3) {
        Logger({
          type: "info",
          payload: `Self-Reflecting On Output (${this.selfReflected})...\n\n`,
        });
        this.selfReflected++;
        return this.callOllama(
          [
            ...messages,
            message,
            {
              role: "user",
              content:
                "Reflect on your response, find ways to improve it, respond with only the improved version, with no mention of the reflection process, or changes made.",
            },
          ],
          tools,
          true
        );
      }

      return message;
    } catch (error) {
      console.error(error);
      console.debug("History: ", this.history);
      throw new Error("Failed to call Ollama");
    }
  }
}
