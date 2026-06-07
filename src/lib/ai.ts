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

export async function generateDrills(subject: string, topic: string, count: number = 3, seed?: string): Promise<DrillQuestion[]> {
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
${seed ? `作成のバリエーションを増やすためのシード値: ${seed}` : ''}
他の問題と重複しないように、ユニークな視点や数値設定で作成してください。

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

  console.log(`AI生成開始: ${subject} - ${topic} (${count}問) ${seed ? `[seed: ${seed}]` : ''}`);

  try {
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
      const result = Array.isArray(questions) ? questions : [questions];
      console.log(`AI生成完了: ${subject} - ${topic} (${result.length}問取得)`);
      return result;
    }
  } catch (error: any) {
    console.error("Failed to generate drills", error);
    // 呼び出し側で個別にハンドリングしやすくするため、ここではエラーを投げるか空配列を返す
    // DrillPage側で1問目の場合はエラー用カードを出したいので、ここでは空配列を返して、呼び出し側で判断する
    return [];
  }
  return [];
}
