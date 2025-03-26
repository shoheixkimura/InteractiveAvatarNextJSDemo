import { Badge, Button, Tooltip } from "@nextui-org/react";
import { useCallback } from "react";

interface RecognizedFace {
  person: string;
  isChild: boolean;
  gender: string;
  lastGreetedTime: number;
}

interface FaceRecognitionUIProps {
  isEnabled: boolean;
  isAnalyzing: boolean;
  recognizedFaces: RecognizedFace[];
  errorMessage: string;
  onStart: () => Promise<void>;
  onStop: () => void;
  onAnalyze: () => Promise<void>;
  fullscreenMode?: boolean;
}

/**
 * 顔認識機能のUIコンポーネント
 */
export default function FaceRecognitionUI({
  isEnabled,
  isAnalyzing,
  recognizedFaces,
  errorMessage,
  onStart,
  onStop,
  onAnalyze,
  fullscreenMode = false
}: FaceRecognitionUIProps) {
  
  const handleToggle = useCallback(() => {
    if (isEnabled) {
      onStop();
    } else {
      onStart();
    }
  }, [isEnabled, onStart, onStop]);
  
  // 顔アイコンコンポーネント
  const FaceIcon = () => (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="8" r="5" />
      <path d="M20 21a8 8 0 1 0-16 0" />
    </svg>
  );
  
  // フルスクリーンモード用のフローティングボタン
  if (fullscreenMode) {
    return (
      <>
        <Button
          onClick={handleToggle}
          className={`absolute bottom-8 left-24 p-4 rounded-full ${
            isEnabled ? "bg-purple-500" : "bg-gray-500"
          } text-white shadow-lg transition-all duration-300 hover:scale-110`}
          style={{ zIndex: 1000 }}
        >
          <FaceIcon />
          {isAnalyzing && <span className="absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>}
        </Button>
        
        {/* 認識された人物リスト */}
        {isEnabled && recognizedFaces.length > 0 && (
          <div className="absolute top-2 left-2 bg-black bg-opacity-50 rounded-lg p-2 text-white">
            <h3 className="text-sm font-bold mb-1">認識された人物:</h3>
            <ul className="text-xs">
              {recognizedFaces.map((face, index) => (
                <li key={index} className="mb-1">
                  {face.person}さん ({face.isChild ? "子供" : "大人"}, {face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"})
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {/* エラーメッセージ */}
        {errorMessage && (
          <div className="absolute top-16 left-1/2 transform -translate-x-1/2 bg-red-500 bg-opacity-80 text-white px-4 py-2 rounded-lg">
            {errorMessage}
          </div>
        )}
        
        {/* 顔認識用カメラのプレビューとキャンバス */}
        {isEnabled && (
          <div className="absolute top-2 right-2 w-64 h-48 bg-black bg-opacity-50 rounded-lg overflow-hidden">
            <div className="w-full h-full">
              <video
                id="face-recognition-video"
                className="w-full h-full"
                playsInline
                muted
                autoPlay
              />
              <canvas
                id="face-recognition-canvas"
                style={{ display: "none" }}
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 text-white text-sm p-1">
              {isAnalyzing ? (
                <span className="flex items-center">
                  <span className="inline-block w-3 h-3 mr-1 bg-red-500 rounded-full animate-pulse"></span>
                  顔分析中...
                </span>
              ) : (
                <span className="flex items-center">
                  <span className="inline-block w-3 h-3 mr-1 bg-green-500 rounded-full"></span>
                  顔認識モード: オン
                </span>
              )}
            </div>
          </div>
        )}
      </>
    );
  }
  
  // 通常表示モード用の標準UI
  return (
    <div className="mt-4 border-t pt-4">
      <h3 className="text-lg font-medium mb-2 flex items-center">
        顔認識
        <Tooltip content="カメラを使って、映っている人の顔を認識し名前で挨拶します">
          <Badge className="ml-2" color="primary" variant="flat">新機能</Badge>
        </Tooltip>
      </h3>
      
      <Button
        color={isEnabled ? "danger" : "success"}
        variant="flat"
        onClick={handleToggle}
        className="w-full mb-2"
        startContent={<FaceIcon />}
      >
        {isEnabled ? "顔認識を停止" : "顔認識を開始"}
      </Button>
      
      {errorMessage && (
        <div className="mb-2 p-2 bg-red-100 text-red-800 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}
      
      {isEnabled && (
        <div className="relative">
          <div className="flex justify-between mb-2">
            <small className="text-gray-500">カメラプレビュー</small>
            <Button
              size="sm"
              color="primary"
              isLoading={isAnalyzing}
              onClick={onAnalyze}
              disabled={isAnalyzing}
            >
              今すぐ分析
            </Button>
          </div>
          
          <div
            className="rounded-lg overflow-hidden border"
            style={{ maxWidth: "300px", margin: "0 auto" }}
          >
            <video
              id="face-recognition-video"
              className="w-full h-auto"
              playsInline
              muted
              autoPlay
            />
            <canvas
              id="face-recognition-canvas"
              style={{ display: "none" }}
            />
          </div>
          
          {recognizedFaces.length > 0 && (
            <div className="mt-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <h4 className="text-sm font-medium mb-1">認識された人物:</h4>
              <ul className="text-xs">
                {recognizedFaces.map((face, index) => (
                  <li key={index} className="mb-1">
                    {face.person}さん ({face.isChild ? "子供" : "大人"}, {face.gender === "Male" ? "男性" : face.gender === "Female" ? "女性" : "不明"})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}