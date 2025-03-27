import { RekognitionClient, CompareFacesCommand, DetectFacesCommand } from "@aws-sdk/client-rekognition";
import { readdir, readFile } from "fs/promises";
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";

console.log("顔認識APIが読み込まれました");

// AWS認証情報の検証と詳細なエラーメッセージ
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const AWS_REGION = process.env.AWS_REGION || "us-east-1";

// 認証情報の検証
if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
  console.error("警告: AWS認証情報が設定されていません。環境変数にAWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYを設定してください。");
}

console.log("AWS認証情報の状態:", {
  region: AWS_REGION,
  accessKeyId: AWS_ACCESS_KEY_ID ? "設定済み" : "未設定",
  secretAccessKey: AWS_SECRET_ACCESS_KEY ? "設定済み" : "未設定"
});

// AWSクライアントの初期化（認証情報がない場合でもエラーを出さないように空文字を設定）
const rekognition = new RekognitionClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID || "",
    secretAccessKey: AWS_SECRET_ACCESS_KEY || "",
  },
});

// 基準画像が保存されているディレクトリ
const REFERENCE_FACES_DIR = path.join(process.cwd(), "public", "reference-faces");
console.log("参照画像ディレクトリパス:", REFERENCE_FACES_DIR);

// 参照画像ディレクトリの存在を確認
async function validateReferenceDirectory() {
  try {
    // ディレクトリの存在を確認
    const stat = await fs.stat(REFERENCE_FACES_DIR).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      console.error(`参照画像ディレクトリが存在しません: ${REFERENCE_FACES_DIR}`);
      return false;
    }

    // ディレクトリ内のファイル一覧取得
    const files = await readdir(REFERENCE_FACES_DIR);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    
    console.log(`参照画像ディレクトリ内のファイル(${imageFiles.length}件):`, imageFiles);
    
    if (imageFiles.length === 0) {
      console.warn("参照画像ディレクトリに画像ファイルが存在しません。顔の比較ができません。");
      return false;
    }
    
    return true;
  } catch (err) {
    console.error("参照画像ディレクトリの検証エラー:", err);
    return false;
  }
}

// API初期化時に一度だけディレクトリを検証
validateReferenceDirectory().catch(err => {
  console.error("参照画像ディレクトリの初期検証に失敗しました:", err);
});

// Base64画像データをバイナリバッファに変換する関数
function base64ImageToBuffer(base64Image: string): Buffer {
  try {
    // Data URI形式の場合はプレフィックスを除去
    const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64Data, "base64");
  } catch (error) {
    console.error("Base64画像変換エラー:", error);
    throw new Error("画像データの形式が不正です");
  }
}

// 顔検出を行う関数
async function detectFaces(imageBuffer: Buffer) {
  try {
    console.log("顔の属性を検出中... バッファサイズ:", imageBuffer.length);
    
    // AWS Rekognitionで顔検出を実行
    const detectResponse = await rekognition.send(
      new DetectFacesCommand({
        Image: { Bytes: imageBuffer },
        Attributes: ["ALL"], // すべての属性を取得
      })
    );

    // 検出結果のログ
    if (detectResponse.FaceDetails && detectResponse.FaceDetails.length > 0) {
      console.log(`${detectResponse.FaceDetails.length}つの顔を検出しました`);
      return {
        success: true,
        faceDetails: detectResponse.FaceDetails
      };
    } else {
      console.log("顔が検出されませんでした");
      return {
        success: false,
        message: "顔が検出されませんでした"
      };
    }
  } catch (error) {
    console.error("顔検出エラー:", error);
    return {
      success: false,
      message: "顔検出処理でエラーが発生しました",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// 参照画像と比較する関数
async function compareFaces(sourceImageBuffer: Buffer) {
  try {
    // ディレクトリ内のファイル一覧取得
    const files = await readdir(REFERENCE_FACES_DIR);
    const imageFiles = files.filter(file => /\.(jpg|jpeg|png)$/i.test(file));
    
    if (imageFiles.length === 0) {
      return {
        success: true,
        matchedPerson: null,
        confidence: 0,
        message: "参照画像が見つかりませんでした"
      };
    }

    let matchedPerson = null;
    let highestConfidence = 0;
    let errorCount = 0;

    // すべての参照画像と比較
    for (const file of imageFiles) {
      try {
        console.log(`参照画像と比較中: ${file}`);
        const referenceImagePath = path.join(REFERENCE_FACES_DIR, file);
        const referenceImage = await readFile(referenceImagePath);

        // 比較処理にタイムアウトを設定（10秒）
        const comparePromise = rekognition.send(
          new CompareFacesCommand({
            SourceImage: { Bytes: sourceImageBuffer },
            TargetImage: { Bytes: referenceImage },
            SimilarityThreshold: 70, // 70%以上の類似度のみ一致とみなす
          })
        );

        // 比較処理実行
        const compareResponse = await Promise.race([
          comparePromise,
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error(`${file}との比較がタイムアウトしました`)), 10000)
          )
        ]);

        // 比較結果の処理
        if (compareResponse && 'FaceMatches' in compareResponse) {
          if (compareResponse.FaceMatches && compareResponse.FaceMatches.length > 0) {
            const match = compareResponse.FaceMatches[0];
            console.log(`一致 (${file}): ${match.Similarity}%`);

            if (match.Similarity && match.Similarity > highestConfidence) {
              highestConfidence = match.Similarity;
              // ファイル名から.jpgなどの拡張子を除去して名前を取得
              matchedPerson = path.basename(file, path.extname(file));
              console.log(`新しいベストマッチ: ${matchedPerson} (${highestConfidence.toFixed(2)}%)`);
            }
          } else {
            console.log(`一致なし (${file})`);
          }
        }
      } catch (compareError) {
        errorCount++;
        console.error(`参照画像との比較エラー (${file}):`, compareError);
        // 全ファイルでエラーが発生した場合のみエラーとして扱う
        if (errorCount === imageFiles.length) {
          throw new Error("すべての参照画像との比較に失敗しました");
        }
        // 一部のファイルでエラーが発生した場合は処理を続行
      }
    }

    return {
      success: true,
      matchedPerson,
      confidence: highestConfidence
    };
  } catch (error) {
    console.error("顔比較エラー:", error);
    return {
      success: false,
      message: "顔比較処理でエラーが発生しました",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

// メイン処理
export async function POST(req: Request) {
  console.log("顔認識APIが呼び出されました - " + new Date().toISOString());
  const requestStartTime = Date.now();

  try {
    // リクエストボディのパース
    const body = await req.json();
    
    // 画像データの検証
    if (!body.image) {
      console.error("リクエストに画像データがありません");
      return NextResponse.json({
        success: false,
        message: "画像データが必要です"
      }, { status: 400 });
    }

    const imageDataLength = body.image.length;
    console.log(`リクエスト受信: 画像データサイズ ${Math.round(imageDataLength / 1024)}KB`);

    // サイズの検証（10MB以上は拒否）
    if (imageDataLength > 10 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        message: "画像データが大きすぎます（最大10MB）"
      }, { status: 400 });
    }

    // AWS認証情報の検証
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      return NextResponse.json({
        success: false,
        message: "AWS認証情報が設定されていないため、顔認識を実行できません"
      }, { status: 500 });
    }

    // Base64画像データをバイナリに変換
    const imageBuffer = base64ImageToBuffer(body.image);
    console.log(`バイナリ変換完了: ${imageBuffer.length}バイト`);

    // 顔検出処理
    const detectResult = await detectFaces(imageBuffer);
    if (!detectResult.success) {
      return NextResponse.json({
        success: false,
        message: detectResult.message || "顔検出に失敗しました"
      }, { status: 400 });
    }

    // 検出された顔の属性情報を取得
    const faceDetails = detectResult.faceDetails[0];
    const isChild = (faceDetails.AgeRange?.Low || 0) < 18;
    const gender = faceDetails.Gender?.Value;
    const ageRange = faceDetails.AgeRange;
    const emotion = faceDetails.Emotions && faceDetails.Emotions.length > 0 
      ? faceDetails.Emotions[0].Type 
      : undefined;

    console.log("検出された顔の属性:", {
      ageRange,
      isChild,
      gender,
      emotion
    });

    // 顔比較処理
    const compareResult = await compareFaces(imageBuffer);
    
    if (!compareResult.success) {
      return NextResponse.json({
        success: false,
        message: compareResult.message || "顔比較処理に失敗しました",
        isChild,
        gender,
        ageRange,
        emotion
      }, { status: 500 });
    }

    // 処理時間の計測
    const processingTime = Date.now() - requestStartTime;
    console.log(`顔認識処理完了: ${processingTime}ms`);
    
    // 最終結果を返す
    const result = {
      success: true,
      person: compareResult.matchedPerson,
      isChild,
      gender,
      confidence: compareResult.confidence,
      ageRange,
      emotion,
      processingTime
    };

    console.log("返却する認識結果:", result);
    return NextResponse.json(result);

  } catch (error) {
    console.error("顔認識処理中にエラーが発生しました:", error);
    return NextResponse.json({
      success: false,
      message: "顔認識処理中にエラーが発生しました",
      detail: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}