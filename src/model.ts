class Model {
  constructor() {}

  async call(prompt: string) {
    const response = await fetch("https://fumes-api.onrender.com/llama3", {
      method: "POST",
      body: JSON.stringify({
        prompt: [
          { role: "system", content: "Be a helpful assistant" },
          { role: "user", content: prompt },
        ],
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 600,
      }),
      headers: {
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    return data;
  }
}
