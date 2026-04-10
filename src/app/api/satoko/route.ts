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
ファシリテーターの${name}さんがチェックアウト（退勤）しました！感謝とねぎらいの一言を書いてください。

条件:
- 今日は${monthDay}（${weekday}曜日）
- ${name}さんの参加実績: ${classCount}回
- 1〜2文、40文字以内
- 心からの感謝と温かいねぎらいの口調
- 「ありがとう！」「おつかれさまでした！」「今日も最高だったよ！」のような感謝・労い系メッセージ
- 子どもたちのために頑張ってくれたことへの感謝を込める
- メッセージのみ出力`;
  } else {
    prompt = `あなたは「AI-SATO-β（さとこ）」。子ども向けアート教室「アートデザインラボ」のAIアシスタントです。
ファシリテーター（先生）の${name}さんに向けて、短い一言メッセージを書いてください。

条件:
- 今日は${monthDay}（${weekday}曜日）
- ${name}さんの参加実績: ${classCount}回
- 1〜2文、50文字以内
- ポジティブでユーモアのある口調（「だよ！」「ね！」など親しみやすく）
- 以下のテーマからランダムに1つ選んで織り交ぜる（毎回違うテーマにして！）:
  * 工作・アート・ものづくりの豆知識や小ネタ（絵の具・クレヨン・粘土・画材の歴史など）
  * 色彩心理や配色のトリビア
  * 今日の天気や季節にまつわる話題
  * 美術史・有名アーティストの意外な一面
  * 面白い雑学・余談（世界のアート・博物館情報など）
  * 子どもたちとの楽しいエピソード風
  * 曜日や日付にちなんだ話（今日は何の日？）
  * 創作のコツや脳科学的な話
  * ちょっとした応援・モチベーションの言葉
- 参加実績に応じた温かい一言も自然に入れてOK（無理に入れなくてよい）
- 毎回違う言い回し・違う切り口で新鮮に！ありきたりなフレーズは避けて
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
      `${name}さん、おはよう！今日もキラキラの一日にしよう！`,
      `${name}さん、チェックインありがとう！準備バッチリだね！`,
      `${name}さんが来てくれて、アトリエがパッと明るくなったよ！`,
      `${name}さん、今日はどんな作品が生まれるかな？楽しみ！`,
      `${name}さん、深呼吸してスタート！今日もいい一日に！`,
      `${name}さん、子どもたちのワクワクが待ってるよ〜！`,
      `${name}さん、今日のクラス、絶対最高になるよ！`,
      `${name}さんの笑顔で、今日もアトリエが輝くね！`,
      `${name}さん、出勤ありがとう！いってらっしゃい！`,
      `${name}さん、今日も創造力全開でいこう！`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
  if (type === "checkout") {
    const msgs = [
      `${name}さん、今日もありがとう！おつかれさまでした！`,
      `ありがとう！今日も子どもたちの笑顔が輝いてたよ！`,
      `${name}さん、おつかれさま！ゆっくり休んでね！`,
      `今日もありがとう！すてきなクラスだったよ！`,
      `${name}さん、今日もナイスファシリ！おつかれさま！`,
      `${name}さんのおかげで子どもたち大満足だったよ〜！`,
      `おつかれさま！${name}さんの優しさ、みんなに伝わってたよ！`,
      `${name}さん、今日もありがとう！おいしいもの食べてね！`,
      `${name}さんの一日に感謝！ゆっくりお風呂に浸かってね！`,
      `${name}さん、バッチリだったよ！また明日も待ってるね！`,
      `今日もありがとう！${name}さんは最高のファシリテーター！`,
      `${name}さん、お疲れさま！今日の子どもたち、キラキラしてたね！`,
      `${name}さんのおかげで、今日も素敵なアートが生まれたよ！`,
      `ありがとう${name}さん！帰り道も気をつけてね！`,
    ];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
  const messages = [
    `${name}さん、今日もアートで世界を広げよう！`,
    `${name}さん、子どもたちの笑顔が最高のごほうびだよ！`,
    `${name}さん、${classCount}回の経験が輝いてるよ！`,
    `${name}さん、一緒に楽しいクラスつくろうね！`,
    `${name}さん、絵の具が乾くのは意外と早いって知ってた？手早さ大事！`,
    `${name}さん、子どもの「できた！」の顔はいつ見ても最高だよね！`,
    `${name}さん、今日もアトリエに魔法をかけよう！`,
    `${name}さん、水彩のにじみって偶然が生む芸術なんだって。ステキだね！`,
    `${name}さん、${classCount}回目の今日も、新しい発見があるかもね！`,
    `${name}さん、粘土をこねる感触って、子どもたちの心も柔らかくするんだよ！`,
    `${name}さん、アートに正解はないって、子どもたちが教えてくれるよね！`,
    `${name}さん、今日もファシリ力、めっちゃ頼りにしてるよ！`,
    `${name}さん、クレヨンの語源は「チョーク」だって知ってた？豆知識〜！`,
    `${name}さん、子どもの発想力って大人の想像を超えてくるよね〜！`,
    `${name}さん、ちょっとした声かけが、子どもの創造力を大きく育てるよ！`,
    `${name}さん、${classCount}回積み重ねた経験、今日もキラッと光るね！`,
    `${name}さん、アトリエは子どもたちの第二の家。温かく迎えてあげてね！`,
    `${name}さん、深呼吸して、今日も笑顔でいこう〜！`,
    `${name}さん、失敗作なんてない！全部が作品だよね！`,
    `${name}さん、色の組み合わせで気分も変わるんだって。今日は何色？`,
    `${name}さん、アートは心の栄養！${name}さん自身も楽しんでね！`,
    `${name}さん、子どもたちの「なんで？」に付き合うのって楽しいよね！`,
  ];
  return messages[Math.floor(Math.random() * messages.length)];
}
