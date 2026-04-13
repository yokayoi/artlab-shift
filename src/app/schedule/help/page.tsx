"use client";

import { useRouter } from "next/navigation";

const FAQ_SECTIONS = [
  {
    title: "シフト希望の回答",
    items: [
      {
        q: "シフト希望はどうやって出しますか？",
        a: "「回答受付中」の月のページで、参加可能な時間帯の丸ボタンをタップして○にし、ページ下部の「回答を送信する」を押してください。",
      },
      {
        q: "回答を変更したいです",
        a: "締め切り前であれば何度でも変更できます。丸ボタンをタップして変更し、「回答を更新する」を押してください。",
      },
      {
        q: "回答の締め切りはいつですか？",
        a: "各月のページ上部に締め切り日が表示されています。締め切りを過ぎると回答できなくなりますのでご注意ください。",
      },
    ],
  },
  {
    title: "シフト表の見方",
    items: [
      {
        q: "自分のシフトはどこで確認できますか？",
        a: "シフトが確定すると、ページ上部にシフト表が表示されます。自分の名前がハイライト（濃い色）で表示されます。",
      },
      {
        q: "シフト表の色の意味は？",
        a: "青はカリキュラム、黄色はオーダーメイドのクラスを示しています。シフト表上部の凡例でも確認できます。",
      },
      {
        q: "子ども◯名とは？",
        a: "その時間帯に参加する子どもの人数です。人数に応じて必要なファシリテーター数が決まります。",
      },
    ],
  },
  {
    title: "チェックイン・チェックアウト",
    items: [
      {
        q: "チェックイン・チェックアウトとは？",
        a: "出勤時にINボタン、退勤時にOUTボタンを押すことで、実際の勤務時間が記録されます。給与計算に使用されます。",
      },
      {
        q: "いつチェックインすればいいですか？",
        a: "教室に到着し、準備を始めるタイミングでINボタンを押してください。クラス終了後、片付けが終わったらOUTボタンを押してください。",
      },
      {
        q: "チェックイン時間を間違えました",
        a: "チェックイン・チェックアウト後に表示される時間フィールドをタップすると、時刻を修正できます。",
      },
      {
        q: "チェックインを忘れました",
        a: "管理者に連絡してください。管理者側で勤怠記録を編集できます。",
      },
    ],
  },
  {
    title: "給与について",
    items: [
      {
        q: "給与はどこで確認できますか？",
        a: "各月のページ下部に「今月の給与」セクションがあります。コマ数・実働時間・交通費を含めた合計金額を確認できます。",
      },
      {
        q: "時給はどのように決まりますか？",
        a: "参加クラス数に応じてランク（研修→ブロンズ→シルバー→ゴールド→プラチナ）が上がり、ランクごとに時給が設定されます。",
      },
      {
        q: "交通費はどうなりますか？",
        a: "プロフィールに設定された交通費が、シフトがある月に自動で加算されます。交通費の変更は管理者にご連絡ください。",
      },
    ],
  },
  {
    title: "LINE連携",
    items: [
      {
        q: "LINE連携とは何ですか？",
        a: "LINEアカウントを連携すると、シフト確定通知や前日リマインダーをLINEで受け取れます。プロフィールページから連携できます。",
      },
      {
        q: "LINE連携はどうやってしますか？",
        a: "プロフィールページの「LINE連携」セクションで「LINEアカウントを連携する」ボタンを押し、LINEログイン画面で認証してください。",
      },
      {
        q: "LINE連携を解除したいです",
        a: "プロフィールページの「LINE連携」セクションで「LINE連携を解除」ボタンを押してください。解除するとLINE通知が届かなくなります。",
      },
      {
        q: "LINEでどんな通知が届きますか？",
        a: "シフト確定時の通知と、シフト前日の夕方にリマインダー通知が届きます。管理者からのお知らせが届くこともあります。",
      },
    ],
  },
  {
    title: "Googleカレンダー連携",
    items: [
      {
        q: "シフトがGoogleカレンダーに反映されますか？",
        a: "シフトが公開されると、担当するクラスの予定がGoogleカレンダーの招待として届きます。ログインに使用しているGoogleアカウントのメールアドレスに招待メールが届き、カレンダーに自動的に表示されます。",
      },
      {
        q: "カレンダーの招待が届きません",
        a: "Googleアカウント（ログインに使用しているメールアドレス）に届きます。迷惑メールフォルダもご確認ください。それでも届かない場合は管理者にご連絡ください。",
      },
      {
        q: "シフトが変更された場合、カレンダーはどうなりますか？",
        a: "シフトが再公開されると、古いカレンダーの予定は自動的にキャンセルされ、新しい予定が作成されます。",
      },
    ],
  },
  {
    title: "シフトの変更・その他",
    items: [
      {
        q: "確定後にシフトを変更したい場合は？",
        a: "シフト確定後の変更はLINEにて管理者にご連絡ください。他のファシリテーターとの調整が必要な場合があります。",
      },
      {
        q: "急に出勤できなくなりました",
        a: "できるだけ早くLINEで管理者に連絡してください。代わりのファシリテーターを手配します。",
      },
      {
        q: "年間カレンダーとは？",
        a: "各月のスケジュール状況（準備中・回答受付中・シフト確定済みなど）を一覧で確認できるページです。",
      },
      {
        q: "ニックネームを変更したいです",
        a: "右上のプロフィールアイコンからプロフィール画面に移動し、ニックネームを変更できます。",
      },
    ],
  },
];

export default function HelpPage() {
  const router = useRouter();

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={() => router.back()}
        className="text-sm text-brand-600 mb-4 inline-block"
      >
        ← 戻る
      </button>
      <h1 className="text-xl font-bold text-gray-800 mb-6">アプリの使い方</h1>

      <div className="space-y-6">
        {FAQ_SECTIONS.map((section) => (
          <div key={section.title} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-bold text-gray-700">{section.title}</h2>
            </div>
            <div className="p-4 space-y-3">
              {section.items.map((item) => (
                <details key={item.q} className="group">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-brand-600 transition-colors list-none flex items-start gap-2">
                    <span className="text-brand-500 shrink-0 mt-0.5">Q.</span>
                    <span>{item.q}</span>
                  </summary>
                  <div className="mt-1.5 ml-5 text-sm text-gray-600 leading-relaxed">
                    {item.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center text-sm text-gray-400">
        その他ご不明な点はLINEにてお問い合わせください
      </div>
    </div>
  );
}
