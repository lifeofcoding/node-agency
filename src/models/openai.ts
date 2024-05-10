import OpenAI from "openai";
import Colors from "colors";
import { callFunction } from "../utils";

function isParseableJson(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
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

type OpenAIParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParams.ChatCompletionCreateParamsNonStreaming;
type Messages = OpenAIParams["messages"];
type Message = Messages[0];

export class Model {
  history: Messages = [];
  openai: OpenAI;
  selfReflected: number = 0;
  parallelToolCalls = false;
  isManager = false;
  model: OpenAI.Chat.Completions.ChatCompletionCreateParams["model"] =
    "gpt-3.5-turbo";
  constructor(options?: {
    parallelToolCalls?: boolean;
    OPENAI_API_KEY?: string;
    model?: OpenAI.Chat.Completions.ChatCompletionCreateParams["model"];
  }) {
    const { parallelToolCalls, OPENAI_API_KEY, model } = options || {};
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    });
    this.openai = openai;
    this.parallelToolCalls = parallelToolCalls || false;
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
        content: systemMessage,
      },
      ...this.history,
    ];

    try {
      const message = await this.callGPT(messages, tools);

      this.history.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls,
      });

      if (message.tool_calls) {
        const { tool_calls } = message;
        const toolMessagesResolved: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] =
          [];

        if (this.parallelToolCalls && !this.isManager) {
          const toolMessagePromises = tool_calls.map(async (tool_call) => {
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
        } else {
          for (const tool_call of tool_calls) {
            const toolMessage = await this.processingToolCall(tool_call);

            toolMessagesResolved.push(toolMessage);
          }
        }

        const allMessagesHasResvoled = tool_calls.every((message) => {
          return toolMessagesResolved.find(
            (toolMessage) => toolMessage.tool_call_id === message.id
          );
        });

        if (!allMessagesHasResvoled) {
          const missingToolCalls = tool_calls.filter((message) => {
            return !toolMessagesResolved.find((toolMessage) => {
              toolMessage.tool_call_id === message.id;
            });
          });
          throw new Error(
            "Failed to resolve all tool calls Missing: " +
              missingToolCalls
                .map(
                  (message) =>
                    `Name: '${message.function.name}', ID:${message.id}`
                )
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

      return message.content || "Unknown Error Occurred, Please try again.";
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call GPT-3");
    }
  }

  async callStream(
    systemMessage: string,
    prompt: Message,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    context?: string
  ): Promise<
    AsyncIterableIterator<OpenAI.Chat.Completions.ChatCompletionChunk>
  > {
    prompt.content =
      prompt.content +
      (context
        ? "\n\nHere is further context to help you with your task:\n" + context
        : "");

    this.history.push(prompt);
    const messages: Messages = [
      {
        role: "system",
        content: systemMessage,
      },
      ...this.history,
    ];

    try {
      const message = await this.callGPTStream(messages, tools);

      return message;
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call GPT-3");
    }
  }

  async processingToolCall(
    tool_call: OpenAI.Chat.Completions.ChatCompletionMessageToolCall
  ) {
    const { name, arguments: args } = tool_call.function;

    console.log(
      Colors.yellow("Calling function:"),
      Colors.blue(`'${name}'`),
      "with params:",
      JSON.parse(args),
      "\n\n"
    );

    const result = await callFunction(name, args);

    const toolMessage: Message = {
      role: "tool",
      tool_call_id: tool_call.id,
      content: result,
    };

    return toolMessage;
  }

  async callGPT(
    messages: Messages,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    reflected: boolean = false
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    try {
      const gptResponse = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: tools,
        stream: false,
      });

      const {
        choices: [reply],
        usage,
      } = gptResponse;
      const { message } = reply;

      if (reflected && this.selfReflected >= 3) {
        console.log(Colors.red(`Self-Reflection Limit Reached\n\n`));
      }

      if (!reflected && message.content && this.selfReflected < 3) {
        console.log(
          Colors.blue(
            `Self-Reflecting On Output (${this.selfReflected})...\n\n`
          )
        );
        this.selfReflected++;
        return this.callGPT(
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
      console.debug("History: ", this.history);
      throw new Error("Failed to call GPT-3");
    }
  }

  async callGPTStream(
    messages: Messages,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[]
  ) {
    const gptResponse = await this.openai.chat.completions.create({
      model: this.model,
      messages,
      tools: tools,
      stream: true,
    });

    const _this = this;
    const toolCalls: Array<{
      id: string;
      type: "function";
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    const toolMessages: Message[] = [];
    const stream: ReadableStream<any> = new ReadableStream({
      async start(controller) {
        for await (const value of gptResponse) {
          const choice = value.choices[0];

          const delta = choice.delta;

          if (delta.tool_calls != null) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;
              if (toolCalls[index] == null) {
                if (toolCallDelta.type !== "function") {
                  continue;
                }

                if (toolCallDelta.id == null) {
                  continue;
                }

                if (toolCallDelta.function?.name == null) {
                  continue;
                }

                if (
                  toolCallDelta.function &&
                  toolCallDelta.id &&
                  toolCallDelta.function.name
                ) {
                  toolCalls[index] = {
                    id: toolCallDelta.id,
                    type: "function",
                    function: {
                      name: toolCallDelta.function.name,
                      arguments: toolCallDelta.function.arguments ?? "",
                    },
                  };
                }

                continue;
              }

              const toolCall = toolCalls[index];

              if (toolCallDelta.function?.arguments != null) {
                toolCall.function!.arguments +=
                  toolCallDelta.function?.arguments ?? "";
              }

              // check if tool call is complete
              if (
                toolCall.function?.name == null ||
                toolCall.function?.arguments == null ||
                !isParseableJson(toolCall.function.arguments)
              ) {
                continue;
              }

              console.log(
                Colors.yellow("Calling function:"),
                Colors.blue(`'${toolCall.function.name}'`),
                "with params:",
                JSON.parse(toolCall.function.arguments),
                "\n\n"
              );

              const toolMessage = await _this.processingToolCall(toolCall);

              const toolRequestMessage: Message = {
                role: "assistant",
                content: null,
                tool_calls: [toolCall],
              };
              toolMessages.push(toolRequestMessage, toolMessage);
              continue;
            }
          } else {
            controller.enqueue(value);
          }
        }

        if (toolMessages.length) {
          const allButLastToolMessage = toolMessages.slice(
            0,
            toolMessages.length - 1
          );
          const lastToolMessage = toolMessages[toolMessages.length - 1];
          const newStream = await _this.callGPTStream(
            [...messages, ...allButLastToolMessage, lastToolMessage],
            tools
          );
          for await (const newPart of newStream) {
            controller.enqueue(newPart);
          }
        }
        controller.close();
      },
    });

    return readableStreamAsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>(
      stream
    );
  }
}
