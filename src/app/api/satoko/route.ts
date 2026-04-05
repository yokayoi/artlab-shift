import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const { name, classCount, type } = await req.json();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ message: getFallback(name, classCount, type) });
  }

  const today = new Date();
  const monthDay = `${today.getMonth() + 1}月${today.getDate()}日`;
  const weekday = ["日", "月", "火", "水", "木", "金", "土"][today.getDay()];

  let prompt: string;
  if (type === "checkin") {
    prompt = `あなたは「AI-SATO-β（さとこ）」。子ども向けアート教室「アートデザインラボ」のAIアシスタントです。
ファシリテーターの${name}さんがチェックイン（出勤）しました！元気づける一言を書いてください。

条件:
- 今日は${monthDay}（${weekday}曜日）
- ${name}さんの参加実績: ${classCount}回
- 1〜2文、40文字以内
- ポジティブでエネルギッシュな口調
- 「今日もよろしく！」「がんばろう！」系のモチベーションが上がるメッセージ
- メッセージのみ出力`;
  } else if (type === "checkout") {
    prompt = `あなたは「AI-SATO-β（さとこ）」。子ども向けアート教室「アートデザインラボ」のAIアシスタントです。
ファシリテーターの${name}さんがチェックアウト（退勤）しました！ねぎらいの一言を書いてください。

条件:
- 今日は${monthDay}（${weekday}曜日）
- ${name}さんの参加実績: ${classCount}回
- 1〜2文、40文字以内
- 温かくねぎらう口調
- 「おつかれさま！」系の癒されるメッセージ
- メッセージのみ出力`;
  } else {
    prompt = `あなたは「AI-SATO-β（さとこ）」。子ども向けアート教室「アートデザインラボ」のAIアシスタントです。
ファシリテーター（先生）の${name}さんに向けて、短い一言メッセージを書いてください。

条件:
- 今日は${monthDay}（${weekday}曜日）
- ${name}さんの参加実績: ${classCount}回
- 1〜2文、50文字以内
- ポジティブでユーモアのある口調（「だよ！」「ね！」など親しみやすく）
- 以下のテーマからランダムに1つ選んで織り交ぜる:
  * 工作・アート・ものづくりの豆知識や小ネタ
  * 今日の天気や季節にまつわる話題
  * 面白い雑学・余談
  * 子どもたちとの楽しいエピソード風
  * 曜日や日付にちなんだ話
- 参加実績に応じた温かい一言も自然に入れてOK（無理に入れなくてよい）
- メッセージのみ出力。説明や前置きは不要`;
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 1.2, maxOutputTokens: 100 },
        }),
      }
    );

    if (!res.ok) {
      return NextResponse.json({ message: getFallback(name, classCount) });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (text) {
      return NextResponse.json({ message: text });
    }
  } catch {
    // fallback
  }

  return NextResponse.json({ message: getFallback(name, classCount) });
}

function getFallback(name: string, classCount: number, type?: string): string {
  if (type === "checkin") {
    const msgs = [
      `${name}さん、今日もよろしくね！`,
      `${name}さん、子どもたちが待ってるよ！`,
      `さあ、今日も楽しいクラスにしよう！`,
      `${name}さん、今日のアートを楽しもう！`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
  if (type === "checkout") {
    const msgs = [
      `${name}さん、おつかれさま！`,
      `今日もすてきなクラスだったね！`,
      `${name}さん、ゆっくり休んでね！`,
      `おつかれさま！また次回も楽しみ！`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
  const messages = [
    `${name}さん、今日もアートで世界を広げよう！`,
    `${name}さん、子どもたちの笑顔が最高のごほうびだよ！`,
    `${name}さん、${classCount}回の経験が輝いてるよ！`,
    `${name}さん、一緒に楽しいクラスつくろうね！`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
