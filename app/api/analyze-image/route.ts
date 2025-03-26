import { NextResponse } from "next/server";
import {
  RekognitionClient,
  DetectLabelsCommand,
  DetectFacesCommand,
  DetectTextCommand,
} from "@aws-sdk/client-rekognition";

// AWS Rekognitionクライアントの初期化
const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

export async function POST(request: Request) {
  try {
    const { image } = await request.json();

    if (!image) {
      return NextResponse.json(
        { error: "画像データが必要です" },
        { status: 400 }
      );
    }

    // Base64データからバイナリに変換
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
    const imageBuffer = Buffer.from(base64Data, "base64");

    // 並行して複数の分析を実行
    const [labelsResponse, facesResponse, textResponse] = await Promise.all([
      // ラベル検出（物体、シーン、コンセプトなど）
      rekognition.send(
        new DetectLabelsCommand({
          Image: { Bytes: imageBuffer },
          MaxLabels: 10,
          MinConfidence: 70,
        })
      ),

      // 顔検出（表情、年齢範囲、性別など）
      rekognition.send(
        new DetectFacesCommand({
          Image: { Bytes: imageBuffer },
          Attributes: ["ALL"],
        })
      ),

      // テキスト検出
      rekognition.send(
        new DetectTextCommand({
          Image: { Bytes: imageBuffer },
        })
      ),
    ]);

    // 分析結果から説明文を生成
    let description = "";

    // ラベル検出結果の処理
    if (labelsResponse.Labels && labelsResponse.Labels.length > 0) {
      const labels = labelsResponse.Labels.slice(0, 5)
        .map((label) => label.Name)
        .filter(Boolean)
        .join("、");

      description += `画像には ${labels} が写っています。`;
    }

    // 顔検出結果の処理
    if (facesResponse.FaceDetails && facesResponse.FaceDetails.length > 0) {
      const faceCount = facesResponse.FaceDetails.length;
      description += ` ${faceCount}人の人物が検出されました。`;

      // 各顔の詳細情報を処理
      facesResponse.FaceDetails.forEach((face, index) => {
        let faceDesc = "";

        // 性別
        if (face.Gender) {
          const gender = face.Gender.Value === "Male" ? "男性" : "女性";
          const confidence = Math.round(face.Gender.Confidence || 0);
          faceDesc += `${gender}(確信度${confidence}%)`;
        }

        // 年齢範囲
        if (face.AgeRange) {
          faceDesc += `、${face.AgeRange.Low}〜${face.AgeRange.High}歳`;
        }

        // 感情
        if (face.Emotions && face.Emotions.length > 0) {
          const topEmotion = face.Emotions[0];
          let emotionText = "";

          switch (topEmotion.Type) {
            case "HAPPY":
              emotionText = "笑顔";
              break;
            case "SAD":
              emotionText = "悲しそう";
              break;
            case "ANGRY":
              emotionText = "怒っている";
              break;
            case "CONFUSED":
              emotionText = "困惑している";
              break;
            case "DISGUSTED":
              emotionText = "嫌悪感を示している";
              break;
            case "SURPRISED":
              emotionText = "驚いている";
              break;
            case "CALM":
              emotionText = "落ち着いている";
              break;
            case "FEAR":
              emotionText = "恐れている";
              break;
            default:
              emotionText = "中立的な表情";
              break;
          }

          faceDesc += `、${emotionText}`;
        }

        // メガネ、ひげなどの特徴
        if (face.Eyeglasses && face.Eyeglasses.Value) {
          faceDesc += "、メガネをかけています";
        }
        if (face.Sunglasses && face.Sunglasses.Value) {
          faceDesc += "、サングラスをかけています";
        }
        if (face.Beard && face.Beard.Value) {
          faceDesc += "、ひげがあります";
        }
        if (face.Mustache && face.Mustache.Value) {
          faceDesc += "、口ひげがあります";
        }

        description += ` 人物${index + 1}は${faceDesc}。`;
      });
    }

    // テキスト検出結果の処理
    if (textResponse.TextDetections && textResponse.TextDetections.length > 0) {
      // LINEタイプのテキストのみを抽出（完全な文や単語）
      const lineTexts = textResponse.TextDetections.filter(
        (text) => text.Type === "LINE"
      )
        .map((text) => text.DetectedText)
        .filter(Boolean);

      if (lineTexts.length > 0) {
        const text = lineTexts.join(" ").substring(0, 100);
        description += ` 画像内のテキスト: "${text}"`;
      }
    }

    // 説明文が生成されなかった場合
    if (!description) {
      description = "画像から特定の情報を検出できませんでした。";
    }

    return NextResponse.json({ description });
  } catch (error) {
    console.error("画像分析エラー:", error);
    return NextResponse.json(
      {
        error: "画像分析に失敗しました",
        details: error instanceof Error ? error.message : "不明なエラー",
      },
      { status: 500 }
    );
  }
}
