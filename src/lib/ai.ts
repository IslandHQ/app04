import OpenAI from 'openai';
import { Storage } from './storage';

export interface DrillQuestion {
  subject: string;
  topic: string;
  questionText: string;
  choices: string[];
  correctAnswer: string;
  explanation: string;
  hint1: string;
  hint2: string;
}

export async function generateDrills(
  subject: string,
  topic: string,
  count: number = 1,
  history: string[] = [],
  seed?: number | string,
  customInstructions?: string
): Promise<DrillQuestion[]> {
  const settings = await Storage.getSettings();
  if (!settings.apiKey) return [];

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true 
  });

  const userData = await Storage.getUserData();

  let duplicationPreventionPrompt = '';
  if (settings.duplicatePreventionMode === 'history' && history.length > 0) {
    duplicationPreventionPrompt = `
以下の過去に出題した問題とは重複しないようにしてください：
${history.map((text, i) => `${i + 1}. ${text}`).join('\n')}
`;
  } else if (settings.duplicatePreventionMode === 'seed' || seed) {
    duplicationPreventionPrompt = `
生成シード値: ${seed || Math.random().toString(36).substring(7)}
毎回異なる内容になるようにバリエーションを持たせてください。
`;
  }

  const prompt = `あなたは日本の学習指導要領に精通した優秀なAIチューターです。
中学生の学習指導要領に基づき、以下の条件で適切なレベルのドリル問題を${count}問作成し、JSON形式の「配列」で出力してください。
問題は選択形式（4択）とし、段階的なヒント（2段階）を含めてください。

${customInstructions ? `【特別な指示】\n以下の指示に必ず従ってください：\n${customInstructions}\n` : ''}

JSONの構造は必ず以下の配列形式にしてください。
[
  {
    "subject": "${subject}",
    "topic": "${topic}",
    "questionText": "問題のテキスト",
    "choices": ["選択肢1", "選択肢2", "選択肢3", "選択肢4"],
    "correctAnswer": "正解のテキスト（choicesの中のいずれか一つと完全に一致させること）",
    "explanation": "解説のテキスト",
    "hint1": "第1段階のヒント（考え方のヒント）",
    "hint2": "第2段階のヒント（より具体的なヒント）"
  }
]

ユーザーの学年: ${userData.grade}
科目: ${subject}
単元: ${topic}
難易度: 学習指導要領に基づいた適切なレベル
${duplicationPreventionPrompt}

出力は必ずJSON配列のみにし、余計な説明は省いてください。`;

  const response = await openai.chat.completions.create({
    model: settings.model,
    messages: [
      { role: 'system', content: 'あなたは正確なJSONのみを出力する教育アシスタントです。出力前に内容が学習指導要領に準拠しているか、また正解が選択肢に含まれているかセルフチェックを行ってください。' },
      { role: 'user', content: prompt }
    ]
  });

  const content = response.choices[0]?.message?.content;
  if (content) {
    // Remove markdown code blocks if present
    const jsonStr = content.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(jsonStr);
    // openaiのjson_objectは{ "questions": [...] }のような形式で返ってくることがあるため、配列を抽出
    const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.drills || Object.values(parsed)[0]);
    return Array.isArray(questions) ? questions : [questions];
  }

  return [];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function chatWithTutor(
  messages: ChatMessage[],
  currentQuestion: DrillQuestion
): Promise<string | null> {
  const settings = await Storage.getSettings();
  if (!settings.apiKey) return null;

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true
  });

  const systemPrompt = `あなたはソクラテス式の質問手法を用いる優秀なAI家庭教師です。
現在ユーザーが解いている問題は以下の通りです：

教科: ${currentQuestion.subject}
単元: ${currentQuestion.topic}
問題: ${currentQuestion.questionText}
選択肢: ${currentQuestion.choices.join(', ')}
正解: ${currentQuestion.correctAnswer}
解説: ${currentQuestion.explanation}

ユーザーはあなたに質問をしてきます。
以下のルールに必ず従ってください：
1. ユーザーに対して「直接的な答え」や「正解（${currentQuestion.correctAnswer}）」を絶対に教えないでください。
2. ユーザーが自分で考え、答えを導き出せるように、ヒントや質問を投げかけてください。
3. 対話的で、ユーザーの理解度に応じた親しみやすいトーンで接してください。
4. ユーザーが正解にたどり着いた場合は、大いに褒めてください。`;

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ]
    });

    return response.choices[0]?.message?.content || null;
  } catch (error) {
    console.error('Chat error:', error);
    return null;
  }
}
