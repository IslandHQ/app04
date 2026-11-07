import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY || '',
  baseURL: process.env.AI_ENDPOINT || 'https://api.openai.com/v1',
  defaultHeaders: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

async function main() {
  try {
    const response = await openai.chat.completions.create({
      model: process.env.AI_MODEL || 'gpt-4o',
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
