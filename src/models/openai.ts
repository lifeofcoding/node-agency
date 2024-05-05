import OpenAI from "openai";
import { callFunction } from "../utils";

type OpenAIParams =
  OpenAI.Chat.Completions.ChatCompletionCreateParams.ChatCompletionCreateParamsNonStreaming;
type Messages = OpenAIParams["messages"];
type Message = Messages[0];

export class Model {
  history: Messages = [];
  openai: OpenAI;
  constructor(OPENAI_API_KEY?: string) {
    const openai = new OpenAI({
      apiKey: OPENAI_API_KEY || process.env.OPENAI_API_KEY,
    });
    this.openai = openai;
  }
  async call(
    systemMessage: string,
    prompt: string | Message,
    tools: OpenAI.Chat.Completions.ChatCompletionTool[],
    context?: string
  ): Promise<string> {
    const input: Message =
      typeof prompt === "string"
        ? {
            role: "user",
            content: prompt,
          }
        : prompt;

    input.content = input.content + (context ? context : "");
    this.history.push(input);
    const messages: Messages = [
      {
        role: "system",
        content: systemMessage,
      },
      ...this.history,
    ];

    try {
      console.log("Calling GPT-3", JSON.stringify(messages, null, 2));
      const gptResponse = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
        tools: tools,
        stream: false,
      });

      const {
        choices: [reply],
        usage,
      } = gptResponse;
      const { message } = reply;

      this.history.push({
        role: "assistant",
        content: message.content,
        tool_calls: message.tool_calls,
      });

      if (message.tool_calls) {
        const { tool_calls } = message;
        const toolMessages = tool_calls.map(async (tool_call) => {
          const { name, arguments: args } = tool_call.function;

          console.log(
            "Calling function:",
            name,
            "with params:",
            JSON.parse(args)
          );

          const result = await callFunction(name, args);

          const toolMessage: Message = {
            role: "tool",
            tool_call_id: tool_call.id,
            content: result,
          };

          return toolMessage;
        });

        const toolMessagesResolved = await Promise.all(toolMessages);
        const lastMessage =
          toolMessagesResolved[toolMessagesResolved.length - 1];
        const allButLastMessage = toolMessagesResolved.slice(
          0,
          toolMessagesResolved.length - 1
        );

        this.history.push(...allButLastMessage);

        return this.call(systemMessage, lastMessage, tools);
      }

      return message.content || "Unknown Error";
    } catch (error) {
      console.error(error);
      throw new Error("Failed to call GPT-3");
    }
  }
}
