import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'sk-lLg84WipxeRnLJLhzcIkLizL3sSHXAawNEXr5ZQHKVyvZz9P',
  baseURL: 'https://npi.rd5.cc/v1',
  defaultHeaders: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

async function main() {
  try {
    const response = await openai.chat.completions.create({
      model: 'gemma-4-26b-a4b',
      messages: [
        { role: 'user', content: 'あなたは中学生向けの優秀なチューターです。ドリル問題を1問作成してください。' }
      ]
    });
    console.log(response.choices[0]?.message?.content);
  } catch (error) {
    console.error(error);
  }
}

main();
