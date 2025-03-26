import { useState, useRef, useCallback, useEffect } from 'react';
import { captureAndAnalyzeFace, setupVideoStream } from './FaceRecognitionHelpers';

// 認識された顔の情報を格納する型
export interface RecognizedFace {
  person: string;
  isChild: boolean;
  gender: string;
  lastGreetedTime: number;
  confidence: number; // 追加: 認識の確信度
}

// フックの戻り値の型
export interface UseFaceRecognitionReturn {
  isEnabled: boolean;
  isAnalyzing: boolean;
  isGreeting: boolean;
  recognizedFaces: RecognizedFace[];
  currentFace: RecognizedFace | null; // 追加: 現在認識されている顔
  errorMessage: string;
  startRecognition: () => Promise<void>;
  stopRecognition: () => void;
  analyzeCurrentFrame: () => Promise<void>;
  resetRecognizedFaces: () => void; // 追加: 認識した顔をリセットする関数
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

  // リソースのクリーンアップ関数
  const cleanup = useCallback(() => {
    onDebug('リソースをクリーンアップしています...');
    
    // インターバルをクリア
    if (recognitionIntervalRef.current) {
      clearInterval(recognitionIntervalRef.current);
      recognitionIntervalRef.current = null;
    }

    // メディアストリームをクリア
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => {
        track.stop();
        onDebug(`トラック ${track.kind} を停止しました`);
      });
      mediaStream.current = null;
    }

    // ビデオ要素のストリームをクリア
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    if (videoElement && videoElement.srcObject) {
      videoElement.srcObject = null;
      videoElement.load(); // メモリ解放のために明示的にロードをリセット
    }
  }, [videoId, onDebug]);

  // 認識した顔をリセットする関数
  const resetRecognizedFaces = useCallback(() => {
    setRecognizedFaces([]);
    setCurrentFace(null);
    onDebug('認識した顔の履歴をリセットしました');
  }, [onDebug]);

  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    isMounted.current = true; // マウント時にフラグをtrueに設定
    
    return () => {
      isMounted.current = false; // アンマウント時にフラグをfalseに設定
      cleanup();
    };
  }, [cleanup]);

  // 顔認識の結果を処理する関数（共通ロジック）
  const processFaceRecognitionResult = useCallback(async (result: any) => {
    if (!result.success || !result.person) {
      onDebug('顔認識に失敗したか、認識された人物がいません');
      return false;
    }
    
    if (result.confidence < confidenceThreshold) {
      onDebug(`認識された人物 ${result.person} の確信度が低すぎます (${result.confidence.toFixed(2)}% < ${confidenceThreshold}%)`);
      return false;
    }
    
    const { person, isChild, gender, confidence } = result;
    onDebug(`顔認識結果: ${person}さん (${confidence.toFixed(2)}% 確信度) - ${isChild ? '子供' : '大人'}, ${gender}`);
    
    // 新しい顔情報を作成
    const faceInfo: RecognizedFace = {
      person,
      isChild,
      gender,
      confidence,
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
        onDebug(`${person}さんが再度検出されました。前回の挨拶から${Math.floor(timeSinceLastGreeting / 1000)}秒経過`);
        
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
          }
          return false;
        }
      } else {
        // クールダウン期間中
        onDebug(`${person}さんは最近挨拶済みです（${Math.floor(timeSinceLastGreeting / 1000)}秒前）`);
        return false;
      }
    } else {
      // 初めて認識した人の場合
      onDebug(`新しい人物を認識しました: ${person}さん`);
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
        }
        return false;
      }
    }
  }, [recognizedFaces, greetPerson, onDebug, greetingCooldown, confidenceThreshold]);

  // 現在のフレームを分析する関数
  const analyzeCurrentFrame = useCallback(async () => {
    if (isAnalyzing || isGreeting) {
      console.log("分析をスキップします。条件:", { isAnalyzing, isGreeting });
      return;
    }

    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;

    if (!videoElement || !canvasElement) {
      setErrorMessage('ビデオ要素またはキャンバス要素が見つかりません');
      return;
    }

    try {
      setIsAnalyzing(true);
      onDebug('顔を分析中...');

      const result = await captureAndAnalyzeFace(videoElement, canvasElement);

      if (!result.success || !result.data) {
        throw new Error(result.error?.message || '顔分析に失敗しました');
      }

      await processFaceRecognitionResult(result.data);
      
    } catch (error) {
      console.error('顔認識エラー:', error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      setErrorMessage(`顔認識エラー: ${errorMsg}`);
      onDebug(`顔認識エラー: ${errorMsg}`);
    } finally {
      if (isMounted.current) {
        setIsAnalyzing(false);
      }
    }
  }, [canvasId, isAnalyzing, isGreeting, onDebug, processFaceRecognitionResult, videoId]);

  // 顔認識を開始する関数
  const startRecognition = useCallback(async () => {
    try {
      // 既存のリソースをクリーンアップ
      cleanup();

      // エラーメッセージをクリア
      setErrorMessage('');

      onDebug('カメラへのアクセスを要求中...');

      // カメラへのアクセス許可を取得
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user", // フロントカメラを優先
          width: { ideal: 1280 }, // 理想的な幅
          height: { ideal: 720 } // 理想的な高さ
        }
      });

      // ストリームを保存
      mediaStream.current = stream;

      onDebug('カメラへのアクセスが許可されました');

      // ビデオ要素とキャンバス要素を取得
      const videoElement = document.getElementById(videoId) as HTMLVideoElement;
      const canvasElement = document.getElementById(canvasId) as HTMLCanvasElement;

      if (!videoElement || !canvasElement) {
        throw new Error('ビデオ要素またはキャンバス要素が見つかりません');
      }

      // ビデオストリームを設定
      await setupVideoStream(
        videoElement,
        stream,
        () => {
          if (!isMounted.current) return;
          
          setIsEnabled(true);
          onDebug('顔認識を開始しました');

          // 定期的に顔認識を実行
          recognitionIntervalRef.current = setInterval(() => {
            if (isMounted.current && !isAnalyzing && !isGreeting) {
              analyzeCurrentFrame();
            }
          }, recognitionInterval);

          // 初回の顔認識を少し遅らせて実行（カメラが起動するまで待つ）
          setTimeout(() => {
            if (isMounted.current) {
              analyzeCurrentFrame();
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
      onDebug(`顔認識開始エラー: ${errorMsg}`);
      cleanup();
    }
  }, [analyzeCurrentFrame, canvasId, cleanup, onDebug, recognitionInterval, videoId, isAnalyzing, isGreeting]);

  // 顔認識を停止する関数
  const stopRecognition = useCallback(() => {
    cleanup();
    if (isMounted.current) {
      setIsEnabled(false);
      onDebug('顔認識を停止しました');
    }
  }, [cleanup, onDebug]);

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