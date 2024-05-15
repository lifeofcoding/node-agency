import colors from "colors";

type LoggerProps = {
  type: string;
  payload: string;
};
const Logger = (params: LoggerProps) => {
  const { type, payload } = params;
  switch (type) {
    case "agent":
      try {
        const { role, systemMessage, newPrompt } = JSON.parse(payload);
        console.log(
          colors.yellow(`CALLING AGENT`),
          colors.blue(`${role}`),
          `with`,
          colors.blue(`'${systemMessage}'`),
          `\nWith Input:`,
          colors.blue(`'${newPrompt}'\n`)
        );
      } catch (e) {
        console.error(
          colors.yellow("CALLING AGENT"),
          colors.blue(payload) + "\n\n"
        );
      }
      break;
    case "results":
      try {
        const { role, agentResults } = JSON.parse(payload);
        console.log(
          colors.yellow(`\nAgent`),
          colors.blue(`'${role}'`),
          `Results:\n`,
          colors.blue(`${agentResults}\n\n`)
        );
      } catch (e) {
        console.error(
          colors.yellow("Agent Results"),
          colors.blue(payload) + "\n\n"
        );
      }
      break;
    case "function":
      try {
        const { name, params } = JSON.parse(payload);
        console.log(
          colors.yellow("CALLING FUNCTION:"),
          colors.blue(`'${name}'`),
          "with params:",
          JSON.parse(params),
          "\n\n"
        );
      } catch (e) {
        console.error(
          colors.yellow("CALLING FUNCTION"),
          colors.blue(payload) + "\n\n"
        );
      }
      break;
    case "info":
      console.log(colors.blue("INFO: "), payload);
      break;
    case "error":
      console.error(colors.red("ERROR: "), payload);
      break;
    case "warn":
      console.warn(colors.yellow("WARN: "), payload);
      break;
    default:
      console.log(colors.blue("DEBUG: "), payload);
      break;
  }
};

export { Logger };
