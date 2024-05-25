import OpenAI from "openai";
import { callFunction, readableStreamAsyncIterable } from "../utils";
import { Logger } from "../logger";

function isParseableJson(str: string) {
  try {
    return JSON.parse(str);
  } catch (e) {
    return null;
  }
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
        ? "\n\n## This is results from your coworkers to help you with your task:\n" +
          context
        : "");

    // console.log("-----------------");
    // console.log("Prompt: ", prompt.content);
    // console.log("-----------------");
    // debugger;

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
        if (message.content) {
          Logger({
            type: "info",
            payload: "\n\n" + message.content + "\n\n",
          });
        }
        const { tool_calls } = message;
        const toolMessagesResolved: OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] =
          [];

        const coWorkerCalls = tool_calls.filter((tool_call) => {
          return (
            tool_call.function.name === "delegate_task" ||
            tool_call.function.name === "ask_question"
          );
        });

        if (this.parallelToolCalls && !this.isManager) {
          const filteredCalls = tool_calls.filter((tool_call) => {
            return (
              tool_call.function.name !== "delegate_task" &&
              tool_call.function.name !== "ask_question"
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

      // if (message.content && !message.content.includes("<CONTINUE>")) {
      //   const maxRuntime = new Date().getTime() + 1000 * 60 * 5;
      //   let currentTime = new Date().getTime();
      //   let currentStep = "plan";

      //   while (currentStep === "plan" && currentTime < maxRuntime) {
      //     const plan = await this.call(
      //       systemMessage,
      //       {
      //         role: "user",
      //         content:
      //           "Plan your next steps, when you are ready, if there are no more steps to take then indicate you are done with <CONTINUE> at the very end of your response.",
      //       },
      //       tools
      //     );

      //     if (!plan.includes("<CONTINUE>")) {
      //       message.content = plan;
      //       currentTime = new Date().getTime();
      //     } else {
      //       message.content = plan.replace("<CONTINUE>", "");
      //       currentStep = "execute";
      //     }
      //   }
      // }

      return message.content || "Unknown Error Occurred, Please try again.";
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call GPT-3");
    }
  }

  async callStream(
    systemMessage: string,
    prompt: Message,
    callback: (message: string) => void,
    tools?: OpenAI.Chat.Completions.ChatCompletionTool[],
    context?: string
  ): Promise<AsyncIterableIterator<string>> {
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
      const message = await this.callGPTStream(messages, callback, tools);

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

    Logger({
      type: "function",
      payload: JSON.stringify({
        name,
        params: args,
      }),
    });

    const result = await callFunction(name, args);

    const toolMessage: Message = {
      role: "tool",
      tool_call_id: tool_call.id,
      content: JSON.stringify({ result }),
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
        Logger({ type: "warn", payload: "Self-Reflection Limit Reached\n\n" });
      }

      if (
        !reflected &&
        message.content &&
        this.selfReflected < 3 &&
        !message.tool_calls
      ) {
        Logger({
          type: "info",
          payload: `Self-Reflecting On Output (${this.selfReflected})...\n\n`,
        });
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
      console.error(error);
      console.debug("History: ", this.history);
      throw new Error("Failed to call GPT-3");
    }
  }

  async callGPTStream(
    messages: Messages,
    callback: (message: string) => void,
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
        let currentMessage = "";
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

              Logger({
                type: "function",
                payload: JSON.stringify({
                  name: toolCall.function.name,
                  params: toolCall.function.arguments,
                }),
              });

              const toolMessage = await _this.processingToolCall(toolCall);

              const toolRequestMessage: Message = {
                role: "assistant",
                content: null,
                tool_calls: [toolCall],
              };
              toolMessages.push(toolRequestMessage, toolMessage);
              continue;
            }
          } else if (delta.content != null) {
            controller.enqueue(value.choices[0].delta.content);
            currentMessage += value.choices[0].delta.content;
          }
        }

        if (currentMessage && !toolMessages.length) {
          _this.history.push({
            role: "assistant",
            content: currentMessage,
          });
          callback(currentMessage);
        }

        if (toolMessages.length) {
          _this.history.push(...toolMessages);
          const newStream = await _this.callGPTStream(
            _this.history,
            callback,
            tools
          );
          for await (const newPart of newStream) {
            controller.enqueue(newPart);
          }
        }
        controller.close();
      },
    });

    return readableStreamAsyncIterable<string>(stream);
  }
}
