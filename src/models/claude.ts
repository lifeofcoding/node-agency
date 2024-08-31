import axios from "axios";
import { callFunction, readableStreamAsyncIterable } from "../utils";
import { Logger } from "../logger";
import OpenAI from "openai";

type Role = "user" | "assistant" | "system";

type TextContent = {
  type: "text";
  text: string;
};

type ToolUseContent = {
  type: "tool_use";
  id: string;
  name: string;
  input: any;
};

type ToolUseResultContent = {
  type: "tool_result";
  tool_use_id: string;
  content: any;
};

type Content = TextContent | ToolUseContent | ToolUseResultContent;

interface Message {
  role: Role;
  content: Content[] | string;
}

type Messages = Message[];

export class Model {
  private apiKey: string;
  history: Messages = [];
  selfReflected: number = 0;
  parallelToolCalls = false;
  isManager = false;
  model: string = "claude-3-5-sonnet-20240620";

  constructor(options?: {
    parallelToolCalls?: boolean;
    ANTHROPIC_API_KEY?: string;
    model?: string;
  }) {
    const { parallelToolCalls, ANTHROPIC_API_KEY, model } = options || {};
    this.apiKey = ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";
    this.parallelToolCalls = parallelToolCalls || false;
    this.model = model || this.model;
  }

  async call(
    systemMessage: string,
    prompt: Message,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    context?: string
  ): Promise<string> {
    if (typeof prompt.content === "string") {
      prompt.content =
        prompt.content +
        (context
          ? "\n\n## This is results from your coworkers to help you with your task:\n" +
            context
          : "");
    }

    this.history.push(prompt);
    const messages: Messages = this.history;

    try {
      const message = await this.callClaude(systemMessage, messages, tools);

      this.history.push({
        role: "assistant",
        content: message,
      });

      const [content, ...calls] = message;
      const tool_calls = calls.filter(
        (call) => typeof call !== "string" && call.type === "tool_use"
      ) as ToolUseContent[];
      if (tool_calls.length > 0) {
        const toolMessagesResolved: Message[] = [];
        if (typeof content === "string") {
          Logger({
            type: "info",
            payload: "\n\n" + content + "\n\n",
          });
        }

        const coWorkerCalls = tool_calls.filter((tc) => {
          return tc.name === "delegate_task" || tc.name === "ask_question";
        });

        if (this.parallelToolCalls && !this.isManager) {
          const filteredCalls = tool_calls.filter((tool_call) => {
            return (
              tool_call.name !== "delegate_task" &&
              tool_call.name !== "ask_question"
            );
          });
          const toolMessagePromises = filteredCalls.map(async (tool_call) => {
            return this.processingToolCall(tool_call);
          });

          const toolMessagesSettled = await Promise.allSettled(
            toolMessagePromises
          );

          for (const toolMessage of toolMessagesSettled) {
            if (toolMessage.status === "fulfilled") {
              toolMessagesResolved.push(toolMessage.value);
            }
          }

          for (const tool_call of coWorkerCalls) {
            const toolMessage = await this.processingToolCall(tool_call);

            toolMessagesResolved.push(toolMessage);
          }
        } else {
          for (const tool_call of tool_calls) {
            const toolMessage = await this.processingToolCall(tool_call);

            toolMessagesResolved.push(toolMessage);
          }
        }

        const allMessagesHasResvoled = tool_calls.every((message) => {
          return toolMessagesResolved.find(
            (toolMessage) =>
              typeof toolMessage.content === "object" &&
              toolMessage.content.find(
                (content) =>
                  "tool_use_id" in content && content.tool_use_id === message.id
              )
          );
        });

        if (!allMessagesHasResvoled) {
          const missingToolCalls = tool_calls.filter((message) => {
            return !toolMessagesResolved.find((toolMessage) => {
              typeof toolMessage.content === "object" &&
                toolMessage.content.find(
                  (content) =>
                    "tool_use_id" in content &&
                    content.tool_use_id === message.id
                );
            });
          });
          throw new Error(
            "Failed to resolve all tool calls Missing: " +
              missingToolCalls
                .map((message) => `Name: '${message.name}', ID:${message.id}`)
                .join(", ")
          );
        }

        const lastMessage =
          toolMessagesResolved[toolMessagesResolved.length - 1];
        const allButLastMessage = toolMessagesResolved.slice(
          0,
          toolMessagesResolved.length - 1
        );

        this.history.push(...allButLastMessage);

        return this.call(systemMessage, lastMessage, tools);
      }

      if (!(typeof content !== "string" && "text" in content)) {
        throw new Error("Failed to resolve content");
      }
      return content.text || "Unknown Error Occurred, Please try again.";
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call Claude");
    }
  }

  async callStream(
    systemMessage: string,
    prompt: { role: Role; content: string },
    callback: (message: string) => void,
    tools?: any[],
    context?: string
  ): Promise<AsyncIterableIterator<string>> {
    prompt.content =
      prompt.content +
      (context
        ? "\n\nHere is further context to help you with your task:\n" + context
        : "");

    this.history.push({
      role: prompt.role,
      content: [
        {
          type: "text",
          text: prompt.content,
        },
      ],
    });
    const messages: Messages = this.history;

    try {
      const message = await this.callClaudeStream(
        systemMessage,
        messages,
        callback,
        tools
      );

      return message;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call Claude");
    }
  }

  async callClaude(
    systemMessage: string,
    messages: Messages,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    reflected: boolean = false
  ): Promise<Message["content"]> {
    const converteredTools = tools?.map((tool) => {
      const schema = tool.function.parameters;
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: schema,
      };
    });

    try {
      const response = await axios.post(
        "https://api.anthropic.com/v1/messages",
        {
          model: this.model,
          system: systemMessage,
          messages,
          tools: converteredTools,
          max_tokens: 1000,
        },
        {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": this.apiKey,
            "anthropic-version": "2023-06-01",
          },
        }
      );

      const message = response.data.content as Message["content"];

      if (reflected && this.selfReflected >= 3) {
        Logger({ type: "warn", payload: "Self-Reflection Limit Reached\n\n" });
      }

      if (!reflected && !message[1] && this.selfReflected < 3) {
        Logger({
          type: "info",
          payload: `Self-Reflecting On Output (${this.selfReflected})...\n\n`,
        });
        this.selfReflected++;
        return this.callClaude(
          systemMessage,
          [
            ...messages,
            { role: "assistant", content: message },
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
      throw new Error("Failed to call Claude");
    }
  }

  async processingToolCall(tool_call: ToolUseContent) {
    const { name, input } = tool_call;

    Logger({
      type: "function",
      payload: JSON.stringify({
        name,
        params: input,
      }),
    });

    const result = await callFunction(name, JSON.stringify(input));

    const toolMessage: Message = {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: tool_call.id,
          content: result,
        },
      ],
    };

    return toolMessage;
  }

  async callClaudeStream(
    systemMessage: string,
    messages: Messages,
    callback: (message: string) => void,
    tools?: any[]
  ) {
    const converteredTools = tools?.map((tool) => {
      const schema = tool.function.parameters;
      return {
        name: tool.function.name,
        description: tool.function.description,
        input_schema: schema,
      };
    });
    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: this.model,
        system: systemMessage,
        messages,
        tools: converteredTools,
        max_tokens: 1000,
        stream: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        responseType: "stream",
      }
    );

    const stream = response.data;
    let currentMessage = "";
    let currentToolCalls: ToolUseContent[] = [];
    const _this = this;

    const toolMessages: Message[] = [];

    const readableStream = new ReadableStream({
      async start(controller) {
        stream.on("data", async (chunk: Buffer) => {
          const lines = chunk.toString().split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = JSON.parse(line.slice(6));
              if (data.type === "content_block_delta") {
                const text = data.delta.text;
                if (text) {
                  controller.enqueue(text);
                  currentMessage += text;
                  continue;
                }

                if (
                  currentToolCalls.length > 0 &&
                  data.delta.type === "input_json_delta"
                ) {
                  currentToolCalls[currentToolCalls.length - 1].input +=
                    data.delta.partial_json;
                }
              } else if (data.type === "content_block_start") {
                if (data.content_block.type === "tool_use") {
                  currentToolCalls.push({
                    ...data.content_block,
                    input: "",
                  });
                }
              } else if (data.type === "content_block_stop") {
                // if (currentToolCalls.length > 0) {
                //   const completedToolCall = currentToolCalls.pop();
                //   if (completedToolCall) {
                //     Logger({
                //       type: "function",
                //       payload: JSON.stringify({
                //         name: completedToolCall.name,
                //         params: completedToolCall.input,
                //       }),
                //     });
                //     const toolMessage = await _this.processingToolCall({
                //       ...completedToolCall,
                //       input: JSON.parse(completedToolCall.input),
                //     });
                //     toolMessages.push(toolMessage);
                //   }
                // }
              }
            }
          }
        });

        stream.on("end", async () => {
          if (currentToolCalls.length > 0) {
            const toolRequestMessage: Message = {
              role: "assistant",
              content: [
                {
                  type: "text",
                  text: currentMessage,
                },
                ...currentToolCalls.map((toolCall) => {
                  return {
                    type: "tool_use" as const,
                    id: toolCall.id,
                    name: toolCall.name,
                    input: JSON.parse(toolCall.input),
                  };
                }),
              ],
            };

            toolMessages.push(toolRequestMessage);

            for (const toolCall of currentToolCalls) {
              const toolMessage = await _this.processingToolCall({
                ...toolCall,
                input: JSON.parse(toolCall.input),
              });
              toolMessages.push(toolMessage);
            }
          }
          if (currentMessage && toolMessages.length === 0) {
            _this.history.push({
              role: "assistant",
              content: currentMessage,
            });
            callback(currentMessage);
          }

          if (toolMessages.length > 0) {
            _this.history.push(...toolMessages);

            const newStream = await _this.callClaudeStream(
              systemMessage,
              _this.history,
              callback,
              tools
            );
            for await (const newPart of newStream) {
              controller.enqueue(newPart);
            }
          }
          controller.close();
        });
      },
    });

    return readableStreamAsyncIterable<string>(readableStream);
  }
}
