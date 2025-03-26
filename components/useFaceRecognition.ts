import { useState, useRef, useCallback, useEffect } from 'react';
import { captureAndAnalyzeFace, setupVideoStream } from './FaceRecognitionHelpers';

// 認識された顔の情報を格納する型
export interface RecognizedFace {
  person: string;
  isChild: boolean;
  gender: string;
  lastGreetedTime: number;
  confidence: number; // 認識の確信度
  ageRange?: { low?: number; high?: number }; // 年齢範囲情報を追加
  emotion?: string; // 感情情報を追加
}

// フックの戻り値の型
export interface UseFaceRecognitionReturn {
  isEnabled: boolean;
  isAnalyzing: boolean;
  isGreeting: boolean;
  recognizedFaces: RecognizedFace[];
  currentFace: RecognizedFace | null; // 現在認識されている顔
  errorMessage: string;
  startRecognition: () => Promise<void>;
  stopRecognition: () => void;
  analyzeCurrentFrame: () => Promise<void>;
  resetRecognizedFaces: () => void; // 認識した顔をリセットする関数
}

// 設定オプションの型
interface UseFaceRecognitionOptions {
  greetingCooldown?: number; // 同じ人への挨拶間隔（ミリ秒）
  recognitionInterval?: number; // 顔認識の実行間隔（ミリ秒）
  confidenceThreshold?: number; // 顔認識の確信度の閾値（％）
}

/**
 * 顔認識機能のカスタムフック
 *
 * @param videoId - ビデオ要素のID
 * @param canvasId - キャンバス要素のID
 * @param greetPerson - 人物に挨拶するコールバック関数
 * @param onDebug - デバッグ情報を表示するコールバック
 * @param options - 設定オプション
 * @returns 顔認識の状態と制御関数
 */
export const useFaceRecognition = (
  videoId: string,
  canvasId: string,
  greetPerson: (person: string, isChild: boolean, gender: string) => Promise<void>,
  onDebug: (message: string) => void,
  options: UseFaceRecognitionOptions = {}
): UseFaceRecognitionReturn => {
  // オプションのデフォルト値
  const {
    greetingCooldown = 60000, // デフォルト: 60秒
    recognitionInterval = 5000, // デフォルト: 5秒
    confidenceThreshold = 70 // デフォルト: 70%
  } = options;

  // 状態変数
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGreeting, setIsGreeting] = useState(false);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFace[]>([]);
  const [currentFace, setCurrentFace] = useState<RecognizedFace | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // 参照変数
  const mediaStream = useRef<MediaStream | null>(null);
  const recognitionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(true); // コンポーネントがマウントされているかどうかを追跡
  const startTime = useRef<number>(Date.now()); // 顔認識開始時間
  const recognitionCount = useRef<number>(0); // 顔認識実行回数
  const errorCount = useRef<number>(0); // エラー発生回数
  
  // デバッグログ関数
  const logDebug = useCallback((message: string, ...args: any[]) => {
    console.log(`[顔認識] ${message}`, ...args);
    onDebug(message);
  }, [onDebug]);

  // リソースのクリーンアップ関数
  const cleanup = useCallback(() => {
    logDebug('リソースをクリーンアップしています...');

    // インターバルをクリア
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
      logDebug('認識インターバルをクリアしました');
    }

    // メディアストリームをクリア
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => {
        track.stop();
        logDebug(`トラック ${track.kind} を停止しました`);
      });
      mediaStream.current = null;
    }

    // ビデオ要素のストリームをクリア
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    if (videoElement && videoElement.srcObject) {
      videoElement.srcObject = null;
      videoElement.load(); // メモリ解放のために明示的にロードをリセット
      logDebug('ビデオ要素をクリアしました');
    }

    // エラーメッセージをクリア
    setErrorMessage('');
  }, [videoId, logDebug]);

  // 認識した顔をリセットする関数
  const resetRecognizedFaces = useCallback(() => {
    setRecognizedFaces([]);
    setCurrentFace(null);
    logDebug('認識した顔の履歴をリセットしました');
  }, [logDebug]);

  // コンポーネントのマウント/アンマウント時の処理
  useEffect(() => {
    isMounted.current = true; // マウント時にフラグをtrueに設定
    startTime.current = Date.now(); // 開始時間を記録
    
    return () => {
      isMounted.current = false; // アンマウント時にフラグをfalseに設定
      cleanup();
      
      // 統計情報のログ出力
      const elapsedTime = Date.now() - startTime.current;
      console.log(`[顔認識統計] 実行時間: ${(elapsedTime / 1000).toFixed(1)}秒, 認識実行回数: ${recognitionCount.current}, エラー回数: ${errorCount.current}`);
    };
  }, [cleanup]);

  // 顔認識の結果を処理する関数（共通ロジック）
  const processFaceRecognitionResult = useCallback(async (result: any) => {
    if (!result.success || !result.person) {
      logDebug('顔認識に失敗したか、認識された人物がいません');
      return false;
    }

    if (result.confidence < confidenceThreshold) {
      logDebug(`認識された人物 ${result.person} の確信度が低すぎます (${result.confidence.toFixed(2)}% < ${confidenceThreshold}%)`);
      return false;
    }

    const { person, isChild, gender, confidence, ageRange, emotion } = result;
    logDebug(`顔認識結果: ${person}さん (${confidence.toFixed(2)}% 確信度) - ${isChild ? '子供' : '大人'}, ${gender}, 感情: ${emotion || '不明'}`);
    
    if (ageRange) {
      logDebug(`推定年齢範囲: ${ageRange.low || '?'}-${ageRange.high || '?'}歳`);
    }

    // 新しい顔情報を作成
    const faceInfo: RecognizedFace = {
      person,
      isChild,
      gender,
      confidence,
      ageRange,
      emotion,
      lastGreetedTime: Date.now()
    };

    // 現在の顔を設定
    setCurrentFace(faceInfo);

    // 既に認識した人か確認
    const now = Date.now();
    const existingFaceIndex = recognizedFaces.findIndex(
      face => face.person === person
    );

    if (existingFaceIndex >= 0) {
      // 既に認識した人の場合
      const lastGreeted = recognizedFaces[existingFaceIndex].lastGreetedTime;
      const timeSinceLastGreeting = now - lastGreeted;

      if (timeSinceLastGreeting > greetingCooldown) {
        // 挨拶クールダウン経過後
        logDebug(`${person}さんが再度検出されました。前回の挨拶から${Math.floor(timeSinceLastGreeting / 1000)}秒経過`);

        // 認識情報を更新
        const updatedFaces = [...recognizedFaces];
        updatedFaces[existingFaceIndex] = {
          ...faceInfo,
          lastGreetedTime: now
        };
        setRecognizedFaces(updatedFaces);

        // 挨拶する
        try {
          setIsGreeting(true);
          await greetPerson(person, isChild, gender);
          if (isMounted.current) {
            setIsGreeting(false);
          }
          return true;
        } catch (error) {
          console.error('挨拶処理中にエラーが発生しました:', error);
          if (isMounted.current) {
            setIsGreeting(false);
            setErrorMessage(`挨拶処理中にエラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
          }
          return false;
        }
      } else {
        // クールダウン期間中
        const remainingCooldown = Math.ceil((greetingCooldown - timeSinceLastGreeting) / 1000);
        logDebug(`${person}さんは最近挨拶済みです（${Math.floor(timeSinceLastGreeting / 1000)}秒前、クールダウン残り${remainingCooldown}秒）`);
        return false;
      }
    } else {
      // 初めて認識した人の場合
      logDebug(`新しい人物を認識しました: ${person}さん`);
      setRecognizedFaces(prev => [...prev, faceInfo]);

      // 挨拶する
      try {
        setIsGreeting(true);
        await greetPerson(person, isChild, gender);
        if (isMounted.current) {
          setIsGreeting(false);
        }
        return true;
      } catch (error) {
        console.error('挨拶処理中にエラーが発生しました:', error);
        if (isMounted.current) {
          setIsGreeting(false);
          setErrorMessage(`挨拶処理中にエラーが発生しました: ${error instanceof Error ? error.message : "不明なエラー"}`);
        }
        return false;
      }
    }
  }, [recognizedFaces, greetPerson, logDebug, greetingCooldown, confidenceThreshold]);

  // 現在のフレームを分析する関数
  const analyzeCurrentFrame = useCallback(async () => {
    if (isAnalyzing || isGreeting) {
      console.log("分析をスキップします。現在の状態:", { isAnalyzing, isGreeting });
      return;
    }

    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;

    if (!videoElement || !canvasElement) {
      const missingElement = !videoElement ? 'ビデオ' : 'キャンバス';
      const errorMsg = `${missingElement}要素が見つかりません (ID: ${!videoElement ? videoId : canvasId})`;
      console.error(errorMsg);
      setErrorMessage(errorMsg);
      return;
    }

    try {
      if (!isMounted.current) return;
      
      recognitionCount.current++; // 認識実行回数をインクリメント
      setIsAnalyzing(true);
      logDebug('顔を分析中...');

      // 現在の状態をログ
      console.log("分析開始時の状態:", {
        videoReady: videoElement.readyState,
        videoSize: `${videoElement.videoWidth}x${videoElement.videoHeight}`,
        canvasSize: `${canvasElement.width}x${canvasElement.height}`,
        streamActive: mediaStream.current ? mediaStream.current.active : false
      });

      // 分析開始時間
      const analysisStartTime = Date.now();
      
      // 画像をキャプチャして分析
      const result = await captureAndAnalyzeFace(videoElement, canvasElement);
      
      // 分析終了時間と所要時間
      const analysisEndTime = Date.now();
      const analysisTime = analysisEndTime - analysisStartTime;
      console.log(`顔分析処理時間: ${analysisTime}ms`);

      if (!result.success) {
        errorCount.current++; // エラー回数をインクリメント
        throw new Error(result.error?.message || '顔分析に失敗しました');
      }

      // 分析結果を処理
      if (result.data) {
        await processFaceRecognitionResult(result.data);
      } else {
        logDebug('分析結果にデータがありません');
      }

    } catch (error) {
      errorCount.current++; // エラー回数をインクリメント
      console.error('顔認識エラー:', error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      setErrorMessage(`顔認識エラー: ${errorMsg}`);
      logDebug(`顔認識エラー: ${errorMsg}`);
    } finally {
      if (isMounted.current) {
        setIsAnalyzing(false);
      }
    }
  }, [canvasId, isAnalyzing, isGreeting, logDebug, processFaceRecognitionResult, videoId]);

  // 顔認識を開始する関数
  const startRecognition = useCallback(async () => {
    try {
      // 既存のリソースをクリーンアップ
      cleanup();

      // 統計情報をリセット
      startTime.current = Date.now();
      recognitionCount.current = 0;
      errorCount.current = 0;

      // エラーメッセージをクリア
      setErrorMessage('');

      logDebug('カメラへのアクセスを要求中...');

      // カメラへのアクセス許可を取得
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user", // フロントカメラを優先
            width: { ideal: 1280 }, // 理想的な幅
            height: { ideal: 720 } // 理想的な高さ
          }
        });

        // ストリームを保存
        mediaStream.current = stream;
        logDebug('カメラへのアクセスが許可されました');
        
        // ストリーム情報をログ
        const tracks = stream.getTracks();
        console.log("取得したトラック:", tracks.map(t => ({
          kind: t.kind,
          label: t.label,
          enabled: t.enabled,
          readyState: t.readyState
        })));
      } catch (cameraError) {
        console.error("カメラアクセスエラー:", cameraError);
        throw new Error(`カメラへのアクセスに失敗しました: ${cameraError instanceof Error ? cameraError.message : "不明なエラー"}`);
      }

      // ビデオ要素とキャンバス要素を取得
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;

      if (!videoElement || !canvasElement) {
        throw new Error(`ビデオ要素またはキャンバス要素が見つかりません (ID: ${!videoElement ? videoId : canvasId})`);
      }

      // ビデオストリームを設定
      await setupVideoStream(
        videoElement,
        mediaStream.current,
        () => {
          if (!isMounted.current) return;

          setIsEnabled(true);
          logDebug('顔認識を開始しました');

          // 顔認識の実行間隔を設定
          logDebug(`顔認識インターバルを設定: ${recognitionInterval}ms`);
          recognitionIntervalRef.current = setInterval(() => {
            if (isMounted.current && !isAnalyzing && !isGreeting) {
              analyzeCurrentFrame().catch(err => {
                console.error("定期的な顔認識中にエラーが発生しました:", err);
              });
            }
          }, recognitionInterval);

          // 初回の顔認識を少し遅らせて実行（カメラが起動するまで待つ）
          setTimeout(() => {
            if (isMounted.current && !isAnalyzing && !isGreeting) {
              analyzeCurrentFrame().catch(err => {
                console.error("初回顔認識中にエラーが発生しました:", err);
              });
            }
          }, 2000);
        },
        (error) => {
          throw error;
        }
      );
    } catch (error) {
      console.error('顔認識開始エラー:', error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      setErrorMessage(`顔認識開始エラー: ${errorMsg}`);
      logDebug(`顔認識開始エラー: ${errorMsg}`);
      cleanup();
    }
  }, [analyzeCurrentFrame, canvasId, cleanup, isAnalyzing, isGreeting, logDebug, recognitionInterval, videoId]);

  // 顔認識を停止する関数
  const stopRecognition = useCallback(() => {
    cleanup();
    if (isMounted.current) {
      setIsEnabled(false);
      
      // 統計情報のログ出力
      const elapsedTime = Date.now() - startTime.current;
      console.log(`[顔認識統計] 停止時の統計 - 実行時間: ${(elapsedTime / 1000).toFixed(1)}秒, 認識実行回数: ${recognitionCount.current}, エラー回数: ${errorCount.current}`);
      
      logDebug('顔認識を停止しました');
    }
  }, [cleanup, logDebug]);

  return {
    isEnabled,
    isAnalyzing,
    isGreeting,
    recognizedFaces,
    currentFace,
    errorMessage,
    startRecognition,
    stopRecognition,
    analyzeCurrentFrame,
    resetRecognizedFaces
  };
};