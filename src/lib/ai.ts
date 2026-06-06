import OpenAI from 'openai';
import { Storage } from './storage';

export interface DrillQuestion {
  subject: string;
  topic: string;
  questionText: string;
  correctAnswer: string;
  explanation: string;
}

export async function generateDrills(subject: string, topic: string, count: number = 3): Promise<DrillQuestion[]> {
  const settings = Storage.getSettings();
  if (!settings.apiKey) return [];

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true 
  });

  const prompt = `あなたは中学生向けの優秀なチューターです。
以下の条件でドリル問題を${count}問作成し、JSON形式の「配列」で出力してください。
JSONの構造は必ず以下の配列形式にしてください。
[
  {
    "subject": "${subject}",
    "topic": "${topic}",
    "questionText": "問題のテキスト（例: 3 - 8 = ?。数式のみ、または短い文章）",
    "correctAnswer": "正解のテキスト（例: -5。答えのみ）",
    "explanation": "解説のテキスト（例: 数直線をイメージしてみましょう。3から左に8進むので-5になります。）"
  }
]

ユーザーの学年: 中学生
科目: ${subject}
単元: ${topic}
難易度: 基礎レベル
出力は必ずJSON配列のみにし、余計な説明は省いてください。`;

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }]
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      // Markdownのコードブロックが付与される場合があるため除去
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      return Array.isArray(parsed) ? parsed : [parsed];
    }
  } catch (error: any) {
    console.error("Failed to generate drills", error);
    // エラー内容を画面に表示するために仮の問題オブジェクトを返す
    return [{
      subject: "エラー",
      topic: "通信エラー",
      questionText: `APIへの接続に失敗しました。\n\n詳細: ${error.message}\n\n・設定画面のエンドポイントURLが正しいか確認してください。\n・ブラウザからのアクセス(CORS)が許可されているエンドポイントか確認してください。`,
      correctAnswer: "",
      explanation: "設定画面からURLとAPIキーを見直してください。"
    }];
  }
  return [];
}

export async function generateHint(question: DrillQuestion, userAnswer: string): Promise<string> {
  const settings = Storage.getSettings();
  if (!settings.apiKey) return "APIキーが設定されていません。設定画面から設定してください。";

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true 
  });

  const prompt = `あなたは中学生を優しく指導するチューターです。
生徒が以下の問題を間違えてしまいました。答えを直接教えずに、生徒が自力で正解にたどり着けるような「気づきを与える短いヒント」を1〜2文で教えてください。

問題: ${question.questionText}
正解: ${question.correctAnswer}
生徒の解答: ${userAnswer}
`;

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }]
    });

    return response.choices[0]?.message?.content || "もう一度、よく問題文を読んで考えてみよう！";
  } catch (error) {
    console.error("Failed to generate hint", error);
    return "ネットワークエラーが発生しました。設定を確認してください。";
  }
}
