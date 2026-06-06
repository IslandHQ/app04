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

export async function generateDrills(subject: string, topic: string, count: number = 3): Promise<DrillQuestion[]> {
  const settings = Storage.getSettings();
  if (!settings.apiKey) return [];

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true 
  });

  const userData = Storage.getUserData();
  const prompt = `あなたは日本の学習指導要領に精通した優秀なAIチューターです。
中学生の学習指導要領に基づき、以下の条件で適切なレベルのドリル問題を${count}問作成し、JSON形式の「配列」で出力してください。
問題は選択形式（4択）とし、段階的なヒント（2段階）を含めてください。

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

出力は必ずJSON配列のみにし、余計な説明は省いてください。`;

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [
        { role: 'system', content: 'あなたは正確なJSONのみを出力する教育アシスタントです。出力前に内容が学習指導要領に準拠しているか、また正解が選択肢に含まれているかセルフチェックを行ってください。' },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "text" }
    });

    let content = response.choices[0]?.message?.content;
    if (content) {
      const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      const parsed = JSON.parse(content);
      // openaiのjson_objectは{ "questions": [...] }のような形式で返ってくることがあるため、配列を抽出
      const questions = Array.isArray(parsed) ? parsed : (parsed.questions || parsed.drills || Object.values(parsed)[0]);
      return Array.isArray(questions) ? questions : [questions];
    }
  } catch (error: any) {
    console.error("Failed to generate drills", error);
    // エラー内容を画面に表示するために仮の問題オブジェクトを返す
    return [{
      subject: "エラー",
      topic: "通信エラー",
      questionText: `APIへの接続に失敗しました。\n\n詳細: ${error.message}\n\n・設定画面のエンドポイントURLが正しいか確認してください。\n・ブラウザからのアクセス(CORS)が許可されているエンドポイントか確認してください。`,
      choices: ["設定を確認する", "やり直す", "ヘルプを見る", "閉じる"],
      correctAnswer: "",
      explanation: "設定画面からURLとAPIキーを見直してください。",
      hint1: "設定画面を確認してください。",
      hint2: "APIキーが正しいか確認してください。"
    }];
  }
  return [];
}

export async function gradeAnswer(question: DrillQuestion, userAnswer: string): Promise<{ isCorrect: boolean; feedback: string }> {
  const settings = Storage.getSettings();
  if (!settings.apiKey) return { isCorrect: userAnswer === question.correctAnswer, feedback: "API未設定のため簡易判定を行いました。" };

  const openai = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.endpoint,
    dangerouslyAllowBrowser: true 
  });

  const prompt = `あなたは採点専門のAIモデルです。以下の問題に対するユーザーの回答を客観的に精査し、採点結果をJSONで返してください。
問題: ${question.questionText}
正解: ${question.correctAnswer}
ユーザーの回答: ${userAnswer}

出力形式:
{
  "isCorrect": boolean,
  "feedback": "なぜその回答が正しいか、あるいは間違いかを説明する短いメッセージ"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: settings.model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: "text" }
    });

    let content = response.choices[0]?.message?.content;
    if (content) {
      const jsonMatch = content.match(/\[[\s\S]*\]|\{[\s\S]*\}/);
      if (jsonMatch) {
        content = jsonMatch[0];
      }
      return JSON.parse(content);
    }
  } catch (error) {
    console.error("Failed to grade answer", error);
  }
  return { isCorrect: userAnswer === question.correctAnswer, feedback: question.explanation };
}
