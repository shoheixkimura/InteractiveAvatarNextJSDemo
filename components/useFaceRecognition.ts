import { useState, useRef, useCallback, useEffect } from 'react';
import { captureAndAnalyzeFace, setupVideoStream } from './FaceRecognitionHelpers';

// 認識された顔の情報を格納する型
interface RecognizedFace {
  person: string;
  isChild: boolean;
  gender: string;
  lastGreetedTime: number;
}

// フックの戻り値の型
interface UseFaceRecognitionReturn {
  isEnabled: boolean;
  isAnalyzing: boolean;
  isGreeting: boolean;
  recognizedFaces: RecognizedFace[];
  errorMessage: string;
  startRecognition: () => Promise<void>;
  stopRecognition: () => void;
  analyzeCurrentFrame: () => Promise<void>;
}

/**
 * 顔認識機能のカスタムフック
 * 
 * @param videoId - ビデオ要素のID
 * @param canvasId - キャンバス要素のID
 * @param greetPerson - 人物に挨拶するコールバック関数
 * @param onDebug - デバッグ情報を表示するコールバック
 * @returns 顔認識の状態と制御関数
 */
export const useFaceRecognition = (
  videoId: string,
  canvasId: string,
  greetPerson: (person: string, isChild: boolean, gender: string) => Promise<void>,
  onDebug: (message: string) => void
): UseFaceRecognitionReturn => {
  // 状態変数
  const [isEnabled, setIsEnabled] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGreeting, setIsGreeting] = useState(false);
  const [recognizedFaces, setRecognizedFaces] = useState<RecognizedFace[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  
  // 参照変数
  const mediaStream = useRef<MediaStream | null>(null);
  const recognitionInterval = useRef<NodeJS.Timeout | null>(null);
  const greetingCooldown = 60000; // 同じ人への挨拶のクールダウン（ミリ秒）
  
  // リソースのクリーンアップ関数
  const cleanup = useCallback(() => {
    // インターバルをクリア
    if (recognitionInterval.current) {
      clearInterval(recognitionInterval.current);
      recognitionInterval.current = null;
    }
    
    // メディアストリームをクリア
    if (mediaStream.current) {
      mediaStream.current.getTracks().forEach(track => track.stop());
      mediaStream.current = null;
    }
    
    // ビデオ要素のストリームをクリア
    const videoElement = document.getElementById(videoId) as HTMLVideoElement;
    if (videoElement && videoElement.srcObject) {
      videoElement.srcObject = null;
    }
  }, [videoId]);
  
  // コンポーネントのアンマウント時にクリーンアップ
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);
  
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
      
      const { success, person, isChild, gender, confidence } = result.data;
      
      if (success && person) {
        onDebug(`顔認識結果: ${person}さん (${confidence.toFixed(2)}% 確信度)`);
        
        // 既に認識した人か確認
        const now = Date.now();
        const existingFaceIndex = recognizedFaces.findIndex(
          face => face.person === person
        );
        
        if (existingFaceIndex >= 0) {
          // 既に認識した人の場合、最後の挨拶から一定時間経過していれば再度挨拶
          const lastGreeted = recognizedFaces[existingFaceIndex].lastGreetedTime;
          
          if (now - lastGreeted > greetingCooldown) {
            // 挨拶クールダウン経過後
            const updatedFaces = [...recognizedFaces];
            updatedFaces[existingFaceIndex] = {
              ...updatedFaces[existingFaceIndex],
              lastGreetedTime: now
            };
            setRecognizedFaces(updatedFaces);
            
            setIsGreeting(true);
            await greetPerson(person, isChild, gender);
            setIsGreeting(false);
          } else {
            onDebug(`${person}さんは最近挨拶済みです（${Math.floor((now - lastGreeted) / 1000)}秒前）`);
          }
        } else {
          // 初めて認識した人の場合
          setRecognizedFaces([
            ...recognizedFaces,
            {
              person,
              isChild,
              gender,
              lastGreetedTime: now
            }
          ]);
          
          setIsGreeting(true);
          await greetPerson(person, isChild, gender);
          setIsGreeting(false);
        }
      } else {
        onDebug('顔は検出されましたが、登録されている人物とマッチしませんでした');
      }
    } catch (error) {
      console.error('顔認識エラー:', error);
      const errorMsg = error instanceof Error ? error.message : '不明なエラー';
      setErrorMessage(`顔認識エラー: ${errorMsg}`);
      onDebug(`顔認識エラー: ${errorMsg}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [canvasId, greetPerson, greetingCooldown, isAnalyzing, isGreeting, onDebug, recognizedFaces, videoId]);
  
  // 顔認識を開始する関数
  const startRecognition = useCallback(async () => {
    try {
      // 既存のリソースをクリーンアップ
      cleanup();
      
      // エラーメッセージをクリア
      setErrorMessage('');
      
      // 既存の認識済み顔リストをクリア
      setRecognizedFaces([]);
      
      onDebug('カメラへのアクセスを要求中...');
      
      // カメラへのアクセス許可を取得
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
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
          setIsEnabled(true);
          onDebug('顔認識を開始しました');
          
          // 3秒ごとに顔認識を実行
          recognitionInterval.current = setInterval(() => {
            analyzeCurrentFrame();
          }, 3000);
          
          // 初回の顔認識を少し遅らせて実行（カメラが起動するまで待つ）
          setTimeout(() => {
            analyzeCurrentFrame();
          }, 1500);
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
  }, [analyzeCurrentFrame, canvasId, cleanup, onDebug, videoId]);
  
  // 顔認識を停止する関数
  const stopRecognition = useCallback(() => {
    cleanup();
    setIsEnabled(false);
    onDebug('顔認識を停止しました');
  }, [cleanup, onDebug]);
  
  return {
    isEnabled,
    isAnalyzing,
    isGreeting,
    recognizedFaces,
    errorMessage,
    startRecognition,
    stopRecognition,
    analyzeCurrentFrame
  };
};