import { RekognitionClient, CompareFacesCommand, DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { readdir, readFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";

console.log("顔認識APIが読み込まれました");

// AWS認証情報の検証
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  console.error("警告: AWS認証情報が設定されていません。環境変数を確認してください。");
}

console.log("AWS認証情報:", {
  region: process.env.AWS_REGION || "us-east-1",
  accessKeyId: process.env.AWS_ACCESS_KEY_ID ? "設定されています" : "未設定",
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ? "設定されています" : "未設定"
});

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
  },
});

// 基準画像が保存されているディレクトリ
const REFERENCE_FACES_DIR = path.join(process.cwd(), "public", "reference-faces");
console.log("参照画像ディレクトリ:", REFERENCE_FACES_DIR);

// デバッグ用：存在チェック
try {
  readdir(REFERENCE_FACES_DIR).then(files => {
    console.log("参照画像ディレクトリ内のファイル:", files);
  }).catch(err => {
    console.error("参照画像ディレクトリの読み取りエラー:", err);
  });
} catch (err) {
  console.error("参照画像ディレクトリの読み取りエラー:", err);
}

export async function POST(req: Request) {
  console.log("顔認識APIが呼び出されました");
  
  try {
    const body = await req.json();
    console.log("リクエストを受信しました。画像データの長さ:", body.image ? body.image.length : "なし");
    
    if (!body.image) {
      console.error("リクエストに画像がありません");
      return NextResponse.json({ 
        success: false, 
        message: "画像データが必要です" 
      }, { status: 400 });
    }
    
    // Base64画像データをバイナリに変換
    const buffer = Buffer.from(body.image.replace(/^data:image\/\w+;base64,/, ""), "base64");
    console.log("画像をバイナリに変換しました。サイズ:", buffer.length);
    
    // 顔の属性を検出
    console.log("顔の属性を検出中...");
    const detectResponse = await rekognition.send(
      new DetectFacesCommand({
        Image: { Bytes: buffer },
        Attributes: ["ALL"],
      })
    );
    
    console.log("検出結果:", 
      detectResponse.FaceDetails ? 
      `${detectResponse.FaceDetails.length}つの顔を検出` : 
      "顔が検出されませんでした"
    );
    
    if (!detectResponse.FaceDetails || detectResponse.FaceDetails.length === 0) {
      return NextResponse.json({ success: false, message: "顔が検出されませんでした" });
    }
    
    // 年齢、性別などの属性情報を取得
    const faceDetails = detectResponse.FaceDetails[0];
    const isChild = (faceDetails.AgeRange?.Low || 0) < 18;
    const gender = faceDetails.Gender?.Value;
    
    console.log("検出された顔の属性:", {
      ageRange: faceDetails.AgeRange,
      isChild,
      gender,
      emotion: faceDetails.Emotions?.[0]
    });
    
    // 参照画像ディレクトリから全ての画像ファイルを取得
    console.log("参照画像を読み込み中...");
    const files = await readdir(REFERENCE_FACES_DIR);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    
    console.log("見つかった画像ファイル:", imageFiles);
    
    let matchedPerson = null;
    let highestConfidence = 0;
    
    if (imageFiles.length === 0) {
      console.log("参照画像が見つかりませんでした");
      return NextResponse.json({
        success: true,
        person: null,
        isChild: isChild,
        gender: gender,
        confidence: 0,
        message: "参照画像が見つかりませんでした"
      });
    }
    
    // すべての参照画像と比較
    for (const file of imageFiles) {
      console.log(`参照画像と比較中: ${file}`);
      try {
        const referenceImage = await readFile(path.join(REFERENCE_FACES_DIR, file));
        
        const compareResponse = await rekognition.send(
          new CompareFacesCommand({
            SourceImage: { Bytes: buffer },
            TargetImage: { Bytes: referenceImage },
            SimilarityThreshold: 70,
          })
        );
        
        console.log(`比較結果 (${file}):`, 
          compareResponse.FaceMatches?.length ? 
          `${compareResponse.FaceMatches.length}つの一致を検出` : 
          "一致なし"
        );
        
        if (compareResponse.FaceMatches && compareResponse.FaceMatches.length > 0) {
          const match = compareResponse.FaceMatches[0];
          console.log(`一致 (${file}):`, {
            similarity: match.Similarity,
            boundingBox: match.Face?.BoundingBox
          });
          
          if (match.Similarity && match.Similarity > highestConfidence) {
            highestConfidence = match.Similarity;
            // ファイル名から.jpgなどの拡張子を除去して名前を取得
            matchedPerson = path.basename(file, path.extname(file));
            console.log(`新しいベストマッチ: ${matchedPerson} (${highestConfidence.toFixed(2)}%)`);
          }
        }
      } catch (compareError) {
        console.error(`参照画像との比較エラー (${file}):`, compareError);
      }
    }
    
    console.log("最終的な認識結果:", {
      person: matchedPerson,
      confidence: highestConfidence,
      isChild,
      gender
    });
    
    return NextResponse.json({
      success: true,
      person: matchedPerson,
      isChild: isChild,
      gender: gender,
      confidence: highestConfidence,
    });
    
  } catch (error) {
    console.error("顔認識処理中にエラーが発生しました:", error);
    return NextResponse.json({ 
      success: false, 
      message: "エラーが発生しました",
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}