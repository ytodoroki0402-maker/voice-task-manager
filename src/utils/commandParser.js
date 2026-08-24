export const WARD_COLORS = {
  "1階": "#3b82f6",
  "2階": "#10b981",
  "HCU": "#f97316",
  "SCU": "#ef4444",
  "共通": "#6b7280"
};

export const STATUS = {
  TODO: "未対応",
  IN_PROGRESS: "対応中",
  DONE: "完了"
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64data = reader.result.split(',')[1];
      resolve(base64data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const DEFAULT_KEY_B64 = "QVEuQWI4Uk42SnAtcXhyTXp1aFZGMTNybjc1RW5QZ003Q244UlVhdnlQTTNsLTJPMFdNM2c=";

// Gemini 超堅牢マルチモーダル解析処理
export async function parseAudioWithGemini(audioBlob, apiKey) {
  let effectiveKey = apiKey;
  if (!effectiveKey || effectiveKey.trim() === "") {
    try {
      effectiveKey = atob(DEFAULT_KEY_B64);
    } catch (e) {}
  }

  if (!effectiveKey) {
    throw new Error("Gemini APIキーが設定されていません");
  }

  const base64Audio = await blobToBase64(audioBlob);

  const prompt = `
あなたは医療介護向けタスク管理システムの音声解析AIです。
添付された音声を直接聞き取り、タスクの情報を抽出して以下のJSON形式のみを出力してください。

抽出項目:
- action: "ADD" (追加/新規), "START" (開始/対応中), "COMPLETE" (完了/終わった) のいずれか
- ward: "1階", "2階", "HCU", "SCU" のいずれか（指定がない場合は "指定なし"）
- id: 患者ID（数字のみの文字列）。発言にIDがない場合は null
- content: タスクの具体的な内容（発言から病棟名、ID、アクションに関する言葉を除外し、端的にまとめたもの。例: "点滴交換", "バイタル確認"）
- status: actionがADDなら "未対応", STARTなら "対応中", COMPLETEなら "完了"
- transcribed_text: 音声を文字起こしした全文（日本語）

JSONのみを出力してください（Markdownのバッククォートなどは含めないでください）。
`;

  const candidates = [
    { version: "v1beta", model: "gemini-flash-latest" },
    { version: "v1beta", model: "gemini-pro-latest" },
    { version: "v1beta", model: "gemini-flash-lite-latest" },
    { version: "v1", model: "gemini-flash-latest" }
  ];

  let res = null;
  let lastErrText = "";

  for (const item of candidates) {
    const url = `https://generativelanguage.googleapis.com/${item.version}/models/${item.model}:generateContent?key=${effectiveKey}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": effectiveKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: "audio/webm",
                    data: base64Audio
                  }
                },
                { text: prompt }
              ]
            }
          ]
        })
      });

      if (response.ok) {
        res = response;
        console.log(`Gemini SUCCESS with model: ${item.model}`);
        break;
      } else {
        lastErrText = await response.text();
        console.warn(`Gemini ${item.model} failed (${response.status}):`, lastErrText);
      }
    } catch (e) {
      lastErrText = e.message;
    }
  }

  if (!res || !res.ok) {
    console.error("All Gemini API endpoints failed:", lastErrText);
    let msg = "Gemini APIの呼び出しに失敗しました。";
    try {
      const errJson = JSON.parse(lastErrText);
      if (errJson.error && errJson.error.message) {
        msg += ` (${errJson.error.message})`;
      }
    } catch(e) {
      msg += ` (${lastErrText})`;
    }
    throw new Error(msg);
  }

  const data = await res.json();
  let jsonStr = data.candidates[0].content.parts[0].text.trim();
  jsonStr = jsonStr.replace(/^```json/i, "").replace(/```$/, "").trim();

  const parsed = JSON.parse(jsonStr);
  return parsed;
}
